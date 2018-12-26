const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const filenamify = require('filenamify');
const unusedFilename = require('unused-filename');

const settings = require('./settings.json');

function Server () {
  this.server = express();
  this.http = http.Server(this.server);
  this.io = socketio(this.http);

  this.fileLocation = path.resolve(settings.fileLocation);
  this.historyLocation = path.resolve(settings.historyLocation);

  this.takenBooks = [];

  this.server.use(helmet());
  
  this.server.use(bodyParser.json()); // support json encoded bodies
  this.server.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

  this.server.use(fileUpload({  // support file uploads
    abortOnLimit: true,
    limits: {
      fileSize: (settings.maxFileSize > 0 ? settings.maxFileSize * 1024 * 1024 : Infinity), // filesize in bytes (settings accepts MB)
    },
  }));

  this.server.use(express.static(path.join(__dirname, './public/files/')));
  this.server.use(express.static(path.join(__dirname, './public/history/')));
  this.server.use('/js', express.static(path.join(__dirname, './public/js/')));
  this.server.use('/js', express.static(path.resolve('./node_modules/jquery/dist/')));
  this.server.use('/js', express.static(path.resolve('./node_modules/socket.io-client/dist/')));
  this.server.use('/css', express.static(path.resolve('./node_modules/bulma/css/')));
  this.server.use('/css', express.static(path.join(__dirname, './public/css/')));

  this.server.get('/', (req, res) => {
    const html = this.fillTemplate('./public/index.html');
    if (html) {
      res.send(html);
    } else {
      res.send('Something went wrong!');
    }
  });

  this.server.post('/give', (req, res) => {
    console.log(req.body);
    console.log(req.files);

    let success = false;

    if (Object.keys(req.files).length > 0 && req.body.hasOwnProperty('title') && req.body.hasOwnProperty('summary')) {
      const { book } = req.files;
      const { title, author, summary } = req.body;
      const fileType = book.name.substr(book.name.lastIndexOf('.'));
      success = this.addBook({ book, title, author, summary, fileType }, () => {
        res.send()
      });
    }
    
    res.send(success);
  });

  this.io.on('connection', socket => {
    this.broadcastVisitors();

    socket.on('take book', bookId => {
      const fileLocation = this.takeBook(bookId, socket.id);
      if (fileLocation) {
        console.log(socket.id + ' removed ' + bookId);
        const downloadLocation = fileLocation.substr(fileLocation.lastIndexOf('/'));
        socket.emit('./files' + downloadLocation);
      }
    });

    socket.on('disconnect', () => {
      this.broadcastVisitors();
      this.deleteBooks(socket.id);
    });
  });
}

Server.prototype.fillTemplate = function (file, templateVars = {}) {
  const page = path.join(__dirname, file);
  const data = fs.readFileSync(page, 'utf8');
  if (data) {
    let filledTemplate = data.replace(/\{\{allowedFormats\}\}/g, settings.allowedFormats.join(','))
      .replace(/\{\{maxFileSize\}\}/g, (settings.maxFileSize > 0 ? settings.maxFileSize + 'MB' : 'no'));

    for (let templateVar in templateVars) {
      const regExp = new RegExp('\{\{' + templateVar + '\}\}', 'g')
      filledTemplate = filledTemplate.replace(regexp, templateVars[templateVar]);
    }

    return filledTemplate;
  }
  
  return data;
}

Server.prototype.broadcastVisitors = function () {
  const numberConnected = this.io.of('/').clients().connected.length;
  this.io.emit('connected', numberConnected);
}

Server.prototype.start = function () {
  this.http.listen(settings.port, () => {
    console.log('Started server on port ' + settings.port);
  });
}

Server.prototype.addBook = function (uploadData = {}) {
  const { book } = uploadData;
  const bookId = this.uuid4();
  const bookPath = path.resolve(this.fileLocation, bookId);

  const bookData = {
    title: uploadData.title,
    author: uploadData.author,
    summary: uploadData.summary,
    fileType: book.name.substr(book.name.lastIndexOf('.')),
  }

  console.log('moving the book');
  const bookFilePath = unusedFilename.sync(path.resolve(bookPath + bookData.fileType));
  return book.mv(bookFilePath, function (err) {
    if (err) {
      success = err;
      console.log(err);
    } else {
      const bookDataPath = unusedFilename.sync(path.resolve(bookPath + '.json'));
      fs.writeFileSync(bookDataPath, JSON.stringify(bookData));
      console.log('uploaded ' + bookData.title + ' to ' + bookFilePath + ', and saved metadata to ' + bookDataPath);
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
    takenBooks.push({ socketId, bookId });
    return newFileName;
  });
}

Server.prototype.checkId = function (bookId, callback = () => {}) {
  const bookDataPath = path.resolve(this.fileLocation, bookId + '.json');
  if (fs.existsSync(bookDataPath)) {
    const bookDataRaw = fs.readFileSync(bookDataPath);
    if (bookDataRaw) {
      const bookData = JSON.parse(bookDataRaw);
      const bookPath = path.resolve(this.fileLocation, bookId + bookData.fileType);
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
      this.checkId(data.bookId, (bookPath, bookDataPath) => {
        fs.unlinkSync(bookPath);
        fs.renameSync(bookDataPath, path.resolve(this.historyLocation, data.bookId + '.json'));
      });
    }
  });
  this.takenBooks = this.takenBooks.filter(data => data.socketId === socketId);
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
