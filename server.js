const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const SocketIoServer = require('socket.io');
const filenamify = require('filenamify');
const unusedFilename = require('unused-filename');
const striptags = require('striptags');
const fecha = require('fecha');

const settings = require('./settings.json');
const privateKey = settings.sslPrivateKey ? fs.readFileSync(settings.sslPrivateKey, 'utf8') : null;
const certificate = settings.sslCertificate ? fs.readFileSync(settings.sslCertificate, 'utf8') : null;
const ca = settings.sslCertificateAuthority ? fs.readFileSync(settings.sslCertificateAuthority, 'utf8') : null;

const Templater = require('./templates/Templater');

function Server () {
  this.server = express();
  this.http = http.Server(this.server);
  this.https = privateKey && certificate ? https.createServer({ key: privateKey, cert: certificate, ca }, this.server) : null;
  this.io = SocketIoServer();
  if (!settings.forceHTTPS) {
    this.io.attach(this.http);
  }
  if (this.https) {
    this.io.attach(this.https);
  }

  this.fileLocation = path.resolve(settings.fileLocation);
  this.historyLocation = path.resolve(settings.historyLocation);

  this.templater = new Templater(this);

  this.connections = 0;
  this.takenBooks = [];

  this.shelfCache = [];
  this.historyCache = [];

  require('./routes/middleware')(this);
  
  require('./routes/get_home')(this);

  require('./routes/get_give')(this);
  require('./routes/post_give')(this);

  require('./routes/get_history')(this);

  require('./routes/get_about')(this);

  require('./routes/get_tools')(this);
  require('./routes/post_tools')(this);

  require('./routes/socketio')(this);

  if (settings.federate) {
    require('./routes/activitypub/get_webfinger')(this);
    require('./routes/activitypub/get_actor')(this);
    require('./routes/activitypub/get_outbox')(this);
    require('./routes/activitypub/get_item')(this);
    require('./routes/activitypub/get_followers')(this);
    require('./routes/activitypub/post_inbox')(this);

    if (!fs.existsSync(path.resolve('./publickey.pem')) || !fs.existsSync(path.resolve('./privatekey.pem'))) {
      // https://stackoverflow.com/a/53173811
      const { generateKeyPairSync } = require('crypto');
      const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,  // the length of your key in bits
        publicKeyEncoding: {
          type: 'spki',       // recommended to be 'spki' by the Node.js docs
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',      // recommended to be 'pkcs8' by the Node.js docs
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: settings.pkPassphrase,
        }
      });
      this.publicKey = publicKey;
      this.privateKey = privateKey;
      fs.writeFileSync(path.resolve('./publickey.pem'), publicKey);
      fs.writeFileSync(path.resolve('./privatekey.pem'), privateKey);
      console.log('Created new public and private keys for federation: ./publickey.pem and ./privatekey.pem');
    } else {
      this.publicKey = fs.readFileSync(path.resolve('./publickey.pem')).toString('utf-8');
      this.privateKey = fs.readFileSync(path.resolve('./privatekey.pem')).toString('utf-8');
    }

    const sqlite3 = require('better-sqlite3');
    this.db = new sqlite3(path.resolve('./activitypub.db'), {
      verbose: settings.domain === 'localhost' ? console.log : null,
    });
    this.db.prepare('CREATE TABLE IF NOT EXISTS followers (actor TEXT UNIQUE, created INT)').run();
    this.db.prepare('CREATE TABLE IF NOT EXISTS send_queue (recipient TEXT, data TEXT, action TEXT, attempts INT, last_attempt INT)').run();

    this.followersCache = this.db.prepare('SELECT actor FROM followers ORDER BY created DESC').all();
    if (this.followersCache.length < 1) console.log('No followers!');

    // Start send queue
    var cron = require('node-cron');
    var processQueue = require('./process-queue');
    this.firstSendJob = cron.schedule('* * * * *', () => processQueue.firstSend(this));  // Process first job that hasn't been run every 1 second
    this.attemptResendJob = cron.schedule('* */2 * * *', () => processQueue.attemptResend(this));  // Process resend 2 minutes
  }
}

Server.prototype.replaceBodyWithTooManyBooksWarning = function (body) {
  if (settings.maxLibrarySize > 0) {
    const numberOfBooks = fs.readdirSync(this.fileLocation).filter(fileName => fileName.includes('.json')).length;
    if (numberOfBooks >= settings.maxLibrarySize) {
      body = this.templater.fill('./templates/elements/messageBox.html', {
        style: 'is-danger',
        title: 'Library Full',
        message: 'Sorry, the library has reached its maximum capacity for books! You will need to wait until a book is taken before a new one can be added.',
      });
    }
  }

  return body;
}

Server.prototype.filterJSON = fileName => fileName.includes('.json');
Server.prototype.mapBookData = (folderPath, fileDetails) => { // Get book info from file data
  const fileData = JSON.parse(fs.readFileSync(path.resolve(folderPath, fileDetails.name), 'utf8'));
  return {
    ...fileDetails,
    ...fileData,
  };
};

Server.prototype.getShelfData = function () {
  return fs.readdirSync(this.fileLocation).filter(this.filterJSON)
    .map(fileName => {  // Cache the file data so sorting doesn't need to re-check each file
      const stats = fs.statSync(path.resolve(this.fileLocation, fileName));
      return {
        name: fileName,
        size: stats.size / (1000 * 1000),
        time: stats.mtime.getTime(),
      };
    }).sort((a, b) => a.time - b.time)  // Sort from oldest to newest.
    .map((fileDetails) => this.mapBookData(this.fileLocation, fileDetails));
}

Server.prototype.getHistoryData = function () {
  return fs.readdirSync(this.historyLocation).filter(this.filterJSON)
    .map(fileName => {  // Cache the file data so sorting doesn't need to re-check each file
      return {
        name: fileName,
        time: fs.statSync(path.resolve(this.historyLocation, fileName)).mtime.getTime()
      };
    }).sort((a, b) => b.time - a.time)  // Sort from newest to oldest.
    .map((fileDetails) => this.mapBookData(this.historyLocation, fileDetails));
}

Server.prototype.populateCaches = function () {
  this.shelfCache = this.getShelfData();
  this.historyCache = this.getHistoryData();
}

Server.prototype.addBook = function (uploadData = {}, success = () => {}, error = () => {}) {
  const { book } = uploadData;

  // If the file is too big, error out.
  if (book.truncated === true) {
    delete book;
    return error('The file provided is too big');
  }

  const bookId = this.uuid4();
  const bookPath = path.resolve(this.fileLocation, bookId);

  const bookData = {
    title: striptags(uploadData.title.trim()),
    author: striptags(uploadData.author.trim()),
    summary: striptags(uploadData.summary.trim().replace(/\r\n/g, '\n')),
    contributor: striptags(uploadData.contributor.trim()),
    source: striptags(uploadData.source.trim()),
    added: Date.now(),
    fileType: uploadData.fileType,
  }

  const bookFilePath = unusedFilename.sync(path.resolve(bookPath + bookData.fileType));
  const self = this;
  return book.mv(bookFilePath, function (err) {
    if (err) {
      console.log(err);
      error(err);
    } else {
      const bookDataPath = unusedFilename.sync(path.resolve(bookPath + '.json'));
      fs.writeFileSync(bookDataPath, JSON.stringify(bookData));
      self.shelfCache = self.getShelfData();
      success();

      if (settings.federate && self.followersCache.length > 0) {
        try{
          const query = 'INSERT INTO send_queue (recipient, data, action, attempts, last_attempt) VALUES '
            + self.followersCache.map(() => '(?, ?, ?, ?, ?)').join(', ');
          const stmt = self.db.prepare(query);
          const queueData = self.followersCache.map(follower => [follower, bookDataPath, 'added', 0, 0]);
          stmt.run(queueData);
          self.firstSendJob.start();
        } catch (err) {
          console.error('Could not queue', err);
        }
      }
      // console.log('uploaded ' + bookData.title + ' to ' + bookFilePath + ', and saved metadata to ' + bookDataPath);
    }
  });
}

Server.prototype.takeBook = function (bookId, socketId) {
  return this.checkId(bookId, (bookPath, bookDataPath, bookData) => {
    const bookName = filenamify(bookData.title);
    const newFileName = unusedFilename.sync(path.resolve(this.fileLocation, bookName + bookData.fileType));
    bookData.fileName = newFileName;
    fs.renameSync(bookPath, newFileName);
    fs.writeFileSync(bookDataPath, JSON.stringify(bookData));
    this.takenBooks.push({ socketId, bookId });
    return newFileName.replace(/\\/g, '/');
  });
}

Server.prototype.checkId = function (bookId, callback = () => {}) {
  const bookDataPath = path.resolve(this.fileLocation, bookId + '.json');
  if (fs.existsSync(bookDataPath)) {
    const bookDataRaw = fs.readFileSync(bookDataPath);
    if (bookDataRaw) {
      const bookData = JSON.parse(bookDataRaw);
      const bookPath = bookData.hasOwnProperty('fileName') ? bookData.fileName : path.resolve(this.fileLocation, bookId + bookData.fileType);
      if (fs.existsSync(bookPath)) {
        return callback(bookPath, bookDataPath, bookData);
      }
    }
  }

  return false;
}

Server.prototype.deleteBooks = function (socketId) {
  this.takenBooks.forEach(data => {
    if (data.socketId === socketId) {
      const check = this.checkId(data.bookId, (bookPath, bookDataPath) => {
        fs.unlinkSync(bookPath);
        // console.log('removed ' + bookPath);
        fs.renameSync(bookDataPath, unusedFilename.sync(path.resolve(this.historyLocation, Date.now() + '.json')));
        this.removeHistoryBeyondLimit();
      });
      if (check === false) {
        console.log('couldn\'t find data.bookId');
      }
    }
  });
  this.takenBooks = this.takenBooks.filter(data => data.socketId === socketId);
  this.populateCaches();
}

Server.prototype.removeHistoryBeyondLimit = function () {
  if (settings.maxHistory > 0) {
    let files = fs.readdirSync(this.historyLocation).filter(fileName => fileName.includes('.json'))
      .map(fileName => {  // Cache the file data so sorting doesn't need to re-check each file
        return { name: fileName, time: fs.statSync(path.resolve(this.historyLocation, fileName)).mtime.getTime() };
      }).sort((a, b) => b.time - a.time).map(v => v.name);  // Sort from newest to oldest.
    if (files.length > settings.maxHistory) {
      files.slice(settings.maxHistory).forEach(fileName => {
        const filePath = path.resolve(this.historyLocation, fileName);
        fs.unlink(filePath, err => {
          if (err) {
            console.error(err);
          } else {
            console.log('Deleted ' + filePath);
          }
        })
      });
    }
  }
}

Server.prototype.uuid4 = function () {
  // https://stackoverflow.com/a/2117523
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

Server.prototype.verifySignature = function (publicKey, signature, comparison) {
  const verifier = crypto.createVerify('sha256');
  verifier.update(comparison);
  const pk = crypto.createPublicKey(publicKey);
  return verifier.verify(pk, signature, 'base64');
}

Server.prototype.createSignatureHeaders = function(targetHost) {
  const UTCDateString = new Date().toUTCString();
  const toSign = `(request-target): post /inbox\nhost: ${targetHost}\ndate: ${UTCDateString}`;
  const signer = crypto.createSign('sha256');
  signer.update(toSign);
  const pk = crypto.createPrivateKey({
    key: this.privateKey,
    passphrase: settings.pkPassphrase,
  });
  const signature = signer.sign(pk, 'base64');
  return {
    'Host': targetHost,
    'Date': UTCDateString,
    'Signature': `keyId="https://${settings.domain}/activitypub/actor#main-key",headers="(request-target) host date",signature="${signature}"`,
  };
}

Server.prototype.createActivity = function(bookData) {
  bookData.author = bookData.author ? bookData.author : '<em>author not provided</em>';
  bookData.contributor = bookData.contributor ? bookData.contributor : 'Anonymous';
  let content;
  if (bookData.action === 'added') {
    content = `<p>New ${bookData.fileType} added: ${bookData.title} by ${bookData.author}</p><p>When adding, ${bookData.contributor} commented:</p><p>${md(bookData.summary)}</p>`;
  } else {
    content = `<p>The ${bookData.fileType} file of ${bookData.title} by ${bookData.author} (originally added by ${bookData.contributor}) has been removed from the shelf.</p>`;
  }
  const published = fecha.format(new Date(bookData.date), 'isoDateTime');
  return {
    id: `https://${settings.domain}/activitypub/create-${bookData.date}`,
    type: 'Create',
    actor: `https://${settings.domain}/activitypub/actor`,
    object: {
      id: `https://${settings.domain}/activitypub/${bookData.date}`,
      type: 'Note',
      summary: null,
      inReplyTo: null,
      published,
      url: `https://${settings.domain}/activitypub/${bookData.date}`,
      attributedTo: `https://${settings.domain}/activitypub/actor`,
      content,
      contentMap: { en: content, },
      sensitive: false,
      to: [
        'https://www.w3.org/ns/activitystreams#Public',
      ],
      cc: [
        `https://${settings.domain}/activitypub/followers`,
      ],
      attachment: [],
      tag: [],
      replies: [],
    },
  };
}

Server.prototype.start = function () {
  this.http.listen((process.env.PORT || settings.port), () => {
    console.log('Started server on port ' + (process.env.PORT || settings.port));
  });
  if (this.https) {
    this.https.listen(settings.sslPort, () => {
      console.log('Started SSL server on port ' + settings.sslPort);
    });
  }
}

const server = new Server();
server.start();
server.populateCaches();

// Stop cron jobs when process ends
if (settings.federate) {
  require('node-cleanup')(function (exitCode, signal) {
      server.firstSendJob.destroy();
      server.attemptResendJob.destroy();
      server.db.close();
  });
}
