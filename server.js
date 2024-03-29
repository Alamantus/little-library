const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');
const SocketIoServer = require('socket.io');
const filenamify = require('filenamify');
const unusedFilename = require('unused-filename');
const striptags = require('striptags');

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

  require('./routes/middleware')(this);
  
  require('./routes/get_home')(this);

  require('./routes/get_give')(this);
  require('./routes/post_give')(this);

  require('./routes/get_history')(this);

  require('./routes/get_about')(this);

  require('./routes/get_tools')(this);
  require('./routes/post_tools')(this);

  require('./routes/socketio')(this);
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
  return book.mv(bookFilePath, function (err) {
    if (err) {
      console.log(err);
      error(err);
    } else {
      const bookDataPath = unusedFilename.sync(path.resolve(bookPath + '.json'));
      fs.writeFileSync(bookDataPath, JSON.stringify(bookData));
      success();
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
