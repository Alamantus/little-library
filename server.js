const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');
const SocketIoServer = require('socket.io');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const filenamify = require('filenamify');
const unusedFilename = require('unused-filename');
const striptags = require('striptags');
const snarkdown = require('snarkdown');
const fecha = require('fecha');

const settings = require('./settings.json');
const privateKey = settings.sslPrivateKey ? fs.readFileSync(settings.sslPrivateKey, 'utf8') : null;
const certificate = settings.sslCertificate ? fs.readFileSync(settings.sslCertificate, 'utf8') : null;
const ca = settings.sslCertificateAuthority ? fs.readFileSync(settings.sslCertificateAuthority, 'utf8') : null;

function Server () {
  this.server = express();
  this.http = http.Server(this.server);
  this.https = privateKey && certificate ? https.createServer({ key: privateKey, cert: certificate, ca }, this.server) : null;
  this.io = new SocketIoServer();
  if (!settings.forceHTTPS) {
    this.io.attach(this.http);
  }
  if (this.https) {
    this.io.attach(this.https);
  }

  this.fileLocation = path.resolve(settings.fileLocation);
  this.historyLocation = path.resolve(settings.historyLocation);

  this.templateCache = {};

  this.connections = 0;
  this.takenBooks = [];

  this.server.use(helmet());
  
  this.server.use(bodyParser.json()); // support json encoded bodies
  this.server.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

  this.server.use('/give', fileUpload({  // support file uploads
    limits: {
      fileSize: (settings.maxFileSize > 0 ? settings.maxFileSize * 1024 * 1024 : Infinity), // filesize in bytes (settings accepts MB)
    },
  }));
  this.server.use('/backup', fileUpload()); // Allow file upload on backup with no limits.

  this.server.use('/files', express.static(path.join(__dirname, './public/files/')));
  this.server.use('/css', express.static(path.resolve('./node_modules/bulma/css/')));
  this.server.use('/css', express.static(path.join(__dirname, './public/css/')));
  this.server.use('/js', express.static(path.join(__dirname, './public/js/')));
  this.server.use('/js', express.static(path.resolve('./node_modules/jquery/dist/')));
  this.server.use('/js', express.static(path.resolve('./node_modules/socket.io-client/dist/')));

  // If a `.well-known` directory exists, allow it to be used for things like Let's Encrypt challenges
  if (fs.existsSync(path.resolve('./.well-known'))) {
    this.server.use('/.well-known', express.static(path.resolve('./.well-known')));
  }

  if (this.https && settings.forceHTTPS) {
    this.server.use(function (req, res, next) {
      if (!req.secure) {
        return res.redirect(['https://', req.get('Host'), req.baseUrl].join(''));
      }
      next();0
    });
  }
  
  this.server.get('/', (req, res) => {
    const html = this.generateHomePage(req);
    if (html) {
      res.send(html);
    } else {
      res.send('Something went wrong!');
    }
  });

  this.server.get('/give', (req, res) => {
    const resourcePath = (req.url.substr(-1) === '/' ? '../' : './');
    let body = this.fillTemplate('./templates/pages/uploadForm.html', { resourcePath });
    body = this.replaceBodyWithTooManyBooksWarning(body);

    const html = this.fillTemplate('./templates/htmlContainer.html', { title: 'Give a Book', resourcePath, body });
    res.send(html);
  });
  this.server.post('/give', (req, res) => {
    const resourcePath = (req.url.substr(-1) === '/' ? '../' : './');
    const { title, author, summary, contributor } = req.body;
    if (Object.keys(req.files).length > 0
      && req.body.hasOwnProperty('title') && title.trim() !== ''
      && req.body.hasOwnProperty('summary') && summary.trim() !== '') {
      const { book } = req.files;
      const fileType = book.name.substr(book.name.lastIndexOf('.'));
      this.addBook({ book, title, author, summary, contributor, fileType }, () => {
        const messageBox = this.fillTemplate('./templates/elements/messageBox.html', {
          style: 'is-success',
          header: 'Upload Successful',
          message: 'Thank you for your contribution!'
        });
        const modal = this.fillTemplate('./templates/elements/modal.html', {
          isActive: 'is-active',
          content: messageBox,
        });
        let body = this.fillTemplate('./templates/pages/uploadForm.html', { resourcePath });
        body = this.replaceBodyWithTooManyBooksWarning(body);
        const html = this.fillTemplate('./templates/htmlContainer.html', { title: 'Give a Book', resourcePath, body, modal });
        res.send(html);
      }, (err) => {
        const messageBox = this.fillTemplate('./templates/elements/messageBox.html', {
          style: 'is-danger',
          header: 'Upload Failed',
          message: err,
        });
        const modal = this.fillTemplate('./templates/elements/modal.html', {
          isActive: 'is-active',
          content: messageBox,
        });
        let body = this.fillTemplate('./templates/pages/uploadForm.html', { resourcePath, title, author, summary, contributor });
        body = this.replaceBodyWithTooManyBooksWarning(body);
        const html = this.fillTemplate('./templates/htmlContainer.html', { title: 'Give a Book', resourcePath, body, modal });
        res.send(html);
      });
    } else {
      let errorMessage = '';
      if (Object.keys(req.files).length <= 0) {
        errorMessage += 'You have not selected a file.';
      }
      if (!req.body.hasOwnProperty('title') || req.body.title.trim() === '') {
        errorMessage += (errorMessage.length > 0 ? '<br>' : '') + 'You have not written a title.';
      }
      if (!req.body.hasOwnProperty('summary') || req.body.summary.trim() === '') {
        errorMessage += (errorMessage.length > 0 ? '<br>' : '') + 'You have not written a summary.';
      }
      const message = this.fillTemplate('./templates/elements/messageBox.html', {
        style: 'is-danger',
        header: 'Missing Required Fields',
        message: errorMessage,
      });
      let body = this.fillTemplate('./templates/pages/uploadForm.html', { resourcePath, title, author, summary, contributor });
      body = this.replaceBodyWithTooManyBooksWarning(body);
      const html = this.fillTemplate('./templates/htmlContainer.html', { title: 'Give a Book', resourcePath, body, message });
      res.send(html);
    }
  });

  this.server.get('/history', (req, res) => {
    const html = this.generateHistoryPage(req);
    if (html) {
      res.send(html);
    } else {
      res.send('Something went wrong!');
    }
  });

  this.server.get('/about', (req, res) => {
    const resourcePath = (req.url.substr(-1) === '/' ? '../' : './');
    const body = this.fillTemplate('./templates/pages/about.html', { resourcePath });
    const html = this.fillTemplate('./templates/htmlContainer.html', { title: 'About', body });
    if (html) {
      res.send(html);
    } else {
      res.send('Something went wrong!');
    }
  });

  this.server.get('/backup', (req, res) => {
    if (req.query.pass === settings.backupPassword) {
      const templateValues = {};
      let html = this.fillTemplate('./templates/pages/backup.html', templateValues);

      if (req.query.dl && ['files', 'history'].includes(req.query.dl)) {
        const onezip = require('onezip');
        const { dl } = req.query;
        const saveLocation = path.resolve(this.fileLocation, dl + 'Backup.zip');
        const backupLocation = dl === 'history' ? this.historyLocation : this.fileLocation;
        const files = fs.readdirSync(backupLocation).filter(fileName => !fileName.includes('.zip'));
        onezip.pack(backupLocation, saveLocation, files)
          .on('start', () => {
            console.info('Starting a backup zip of ' + dl)
          })
          .on('error', (error) => {
            console.error(error);
            templateValues[dl + 'Download'] = 'Something went wrong: ' + JSON.stringify(error);
            html = this.fillTemplate('./templates/pages/backup.html', templateValues);
            res.send(html);
          })
          .on('end', () => {
            console.log('Backup complete. Saved to ' + saveLocation);
            let backupLocation = saveLocation.replace(/\\/g, '/');
            backupLocation = backupLocation.substr(backupLocation.lastIndexOf('/'));
            templateValues[dl + 'Download'] = '<a download href="' + encodeURI('./files' + backupLocation) + '">Download</a> (This will be removed from the server in 1 hour)';
            html = this.fillTemplate('./templates/pages/backup.html', templateValues);
            res.send(html);
            console.log('Will delete ' + saveLocation + ' in 1 hour');
            setTimeout(() => {
              fs.unlink(saveLocation, (err) => {
                if (err) {
                  console.error(err);
                } else {
                  console.log('Deleted backup file ' + saveLocation);
                }
              })
            }, 60 * 60 * 1000);
          });
      } else {
        res.send(html);
      }
    } else {
      res.status(400).send();
    }
  });
  this.server.post('/backup', (req, res) => {
    if (req.query.pass === settings.backupPassword) {
      const templateValues = {};
      let html = this.fillTemplate('./templates/pages/backup.html', templateValues);

      const { files } = req;
      if (Object.keys(files).length > 0) {
        const backupType = Object.keys(files)[0];
        if (['files', 'history'].includes(backupType)) {
          const onezip = require('onezip');
          const uploadPath = path.resolve('./', backupType + 'UploadedBackup.zip');
          files[backupType].mv(uploadPath, (err) => {
            if (err) {
              console.error(error);
              templateValues[backupType + 'UploadSuccess'] = 'Could not upload the file.';
              html = this.fillTemplate('./templates/pages/backup.html', templateValues);
              res.send(html);
            } else {
              onezip.extract(uploadPath, path.resolve('./public', backupType))
                .on('start', () => {
                  console.info('Extracting file ' + uploadPath)
                })
                .on('error', (error) => {
                  console.error(error);
                  templateValues[backupType + 'UploadSuccess'] = 'Something went wrong: ' + JSON.stringify(error);
                  html = this.fillTemplate('./templates/pages/backup.html', templateValues);
                  res.send(html);
                })
                .on('end', () => {
                  templateValues[backupType + 'UploadSuccess'] = 'Uploaded Successfully!';
                  html = this.fillTemplate('./templates/pages/backup.html', templateValues);
                  res.send(html);
                  fs.unlink(uploadPath, (err) => {
                    if (err) {
                      console.error(err);
                    } else {
                      console.log('Deleted backup file ' + uploadPath);
                    }
                  })
                });
            }
          });
        } else {
          templateValues['generalError'] = '<p>' + backupType + ' is not a valid backup type.</p>';
          html = this.fillTemplate('./templates/pages/backup.html', templateValues);
          res.send(html);
        }
      } else {
        res.send(html);
      }
    } else {
      res.status(400).send();
    }
  });

  this.io.on('connection', socket => {
    if (!settings.hideVisitors) {
      this.connections++;
      this.io.emit('update visitors', this.connections);
    }

    socket.on('take book', bookId => {
      const fileLocation = this.takeBook(bookId, socket.id);
      if (fileLocation) {
        console.log(socket.id + ' removed ' + bookId);
        const downloadLocation = fileLocation.substr(fileLocation.lastIndexOf('/'));
        socket.emit('get book', encodeURI('./files' + downloadLocation));
        socket.broadcast.emit('remove book', bookId);
      }
    });

    socket.on('disconnect', () => {
      if (!settings.hideVisitors) {
        this.connections--;
        this.io.emit('update visitors', this.connections);
      }
      this.deleteBooks(socket.id);
    });
  });
}

Server.prototype.fillTemplate = function (file, templateVars = {}) {
  let data;
  if (this.templateCache.hasOwnProperty(file)) {
    data = this.templateCache[file];
  } else {
    data = fs.readFileSync(path.join(__dirname, file), 'utf8');
  }
  if (data) {
    if (!this.templateCache.hasOwnProperty(file)) {
      this.templateCache[file] = data;
    }

    let filledTemplate = data.replace(/\{\{siteTitle\}\}/g, settings.siteTitle)
      .replace(/\{\{titleSeparator\}\}/g, settings.titleSeparator)
      .replace(/\{\{allowedFormats\}\}/g, settings.allowedFormats.join(','))
      .replace(/\{\{maxFileSize\}\}/g, (settings.maxFileSize > 0 ? settings.maxFileSize + 'MB' : 'no'));

    for (let templateVar in templateVars) {
      const regExp = new RegExp('\{\{' + templateVar + '\}\}', 'g')
      filledTemplate = filledTemplate.replace(regExp, templateVars[templateVar]);
    }

    // If any template variable is not provided, don't even render them.
    filledTemplate = filledTemplate.replace(/\{\{[a-zA-Z0-9\-_]+\}\}/g, '');

    return filledTemplate;
  }
  
  return data;
}

Server.prototype.replaceBodyWithTooManyBooksWarning = function (body) {
  if (settings.maxLibrarySize > 0) {
    const numberOfBooks = fs.readdirSync(this.fileLocation).filter(fileName => fileName.includes('.json')).length;
    if (numberOfBooks >= settings.maxLibrarySize) {
      body = this.fillTemplate('./templates/elements/messageBox.html', {
        style: 'is-danger',
        title: 'Library Full',
        message: 'Sorry, the library has reached its maximum capacity for books! You will need to wait until a book is taken before a new one can be added.',
      });
    }
  }

  return body;
}

Server.prototype.generateHomePage = function (req) {
  const files = fs.readdirSync(this.fileLocation).filter(fileName => fileName.includes('.json'))
    .map(fileName => {  // Cache the file data so sorting doesn't need to re-check each file
      return { name: fileName, time: fs.statSync(path.resolve(this.fileLocation, fileName)).mtime.getTime() };
    }).sort((a, b) => a.time - b.time).map(v => v.name);  // Sort from oldest to newest.

  let books = files.map(fileName => {
    const bookData = JSON.parse(fs.readFileSync(path.resolve(this.fileLocation, fileName), 'utf8'));
    if (bookData.hasOwnProperty('fileName')) return '';
    bookData.author = bookData.author ? bookData.author : '<em>author not provided</em>';
    bookData.contributor = bookData.contributor ? bookData.contributor : 'Anonymous';

    const id = fileName.replace('.json', '');
    const confirmId = 'confirm_' + id;
    const added = fecha.format(new Date(bookData.added), 'hh:mm:ssA on dddd MMMM Do, YYYY');
    const modal = this.fillTemplate('./templates/elements/modalCard.html', {
      id,
      header: '<h2 class="title">' + bookData.title + '</h2><h4 class="subtitle">' + bookData.author + '</h4>',
      content: this.fillTemplate('./templates/elements/bookInfo.html', {
          contributor: bookData.contributor,
          fileFormat: bookData.fileType,
          added,
          summary: snarkdown(bookData.summary),
        })
        + this.fillTemplate('./templates/elements/modal.html', {
          id: confirmId,
          content: this.fillTemplate('./templates/elements/messageBox.html', {
            header: 'Download Your Book',
            message: this.fillTemplate('./templates/elements/takeConfirm.html', { id }),
          }),
        }),
      footer: '<a class="button close">Close</a> <a class="button is-success modal-button" data-modal="' + confirmId + '">Take Book</a>',
    });
    return this.fillTemplate('./templates/elements/book.html', {
      id,
      title: bookData.title,
      author: bookData.author,
      fileType: bookData.fileType,
      modal,
    });
  }).join('');

  if (books == '') {
    books = '<div class="column"><div class="content">The shelf is empty. Would you like to <a href="/give">add a book</a>?</div></div>';
  }

  const body = '<h2 class="title">Available Books</h2><div class="columns is-multiline">' + books + '</div>';
  return this.fillTemplate('./templates/htmlContainer.html', {
    title: 'View',
    resourcePath: (req.url.substr(-1) === '/' ? '../' : './'),
    body
  });
}

Server.prototype.generateHistoryPage = function (req) {
  const files = fs.readdirSync(this.historyLocation).filter(fileName => fileName.includes('.json'))
    .map(fileName => {  // Cache the file data so sorting doesn't need to re-check each file
      return { name: fileName, time: fs.statSync(path.resolve(this.historyLocation, fileName)).mtime.getTime() };
    }).sort((a, b) => b.time - a.time).map(v => v.name);  // Sort from newest to oldest.

  let history = files.map(fileName => {
    const bookData = JSON.parse(fs.readFileSync(path.resolve(this.historyLocation, fileName), 'utf8'));
    bookData.author = bookData.author ? bookData.author : '<em>author not provided</em>';
    bookData.contributor = bookData.contributor ? bookData.contributor : 'Anonymous';
    const id = fileName.replace('.json', '');
    const added = fecha.format(new Date(bookData.added), 'hh:mm:ssA on dddd MMMM Do, YYYY');
    const removed = fecha.format(new Date(parseInt(id)), 'hh:mm:ssA on dddd MMMM Do, YYYY');
    const removedTag = '<div class="control"><div class="tags has-addons"><span class="tag">Taken</span><span class="tag is-warning">' + removed + '</span></div></div>';
    const modal = this.fillTemplate('./templates/elements/modalCard.html', {
      id,
      header: '<h2 class="title">' + bookData.title + '</h2><h4 class="subtitle">' + bookData.author + '</h4>',
      content: this.fillTemplate('./templates/elements/bookInfo.html', {
        contributor: bookData.contributor,
        fileFormat: bookData.fileType,
        added,
        removedTag,
        summary: snarkdown(bookData.summary),
      }),
      footer: '<a class="button close">Close</a>',
    });
    return this.fillTemplate('./templates/elements/book.html', {
      id,
      title: bookData.title,
      author: bookData.author,
      fileType: bookData.fileType,
      modal,
    });
  }).join('');

  if (history == '') {
    history = '<div class="column"><div class="content">No books have been taken yet. Would you like to <a href="/">take a book</a>?</div></div>';
  }
  
  const body = '<h2 class="title">History</h2><div class="columns is-multiline">' + history + '</div>';
  return this.fillTemplate('./templates/htmlContainer.html', {
    title: 'History',
    resourcePath: (req.url.substr(-1) === '/' ? '../' : './'),
    body
  });
}

Server.prototype.start = function () {
  this.http.listen((process.env.PORT || settings.port), () => {
    console.log('Started server on port ' + (process.env.PORT || settings.port));
  });
  if (this.https) {
    this.https.listen(443, () => {
      console.log('Started SSL server on port 443');
    });
  }
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
    added: Date.now(),
    fileType: book.name.substr(book.name.lastIndexOf('.')),
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

const server = new Server();
server.start();
