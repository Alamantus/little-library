const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const helmet = require('helmet');

const settings = require('./settings.json');

function Server () {
  this.server = express();
  this.http = http.Server(this.server);
  this.io = socketio(this.http);

  this.fileLocation = path.resolve(settings.fileLocation);
  this.historyLocation = path.resolve(settings.historyLocation);

  this.server.use(helmet());
  this.server.use(express.static(path.join(__dirname, './public/')));

  this.server.get('/', (req, res) => {
    const page = path.join(__dirname, './public/index.html');
    res.sendFile(page);
  });

  this.io.on('connection', socket => {
    this.broadcastVisitors();

    socket.on('take book', bookId => {
      if (this.takeBook(bookId)) {
        console.log('deleted ' + bookId);
      }
    });

    socket.on('disconnect', () => {
      this.broadcastVisitors();
    });
  });
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

Server.prototype.takeBook = function (bookId) {
  const bookDataPath = path.resolve(this.fileLocation, bookId, '.json');
  if (fs.existsSync(bookDataPath)) {
    const bookDataRaw = fs.readFileSync(bookDataPath);
    if (bookDataRaw) {
      const bookData = JSON.parse(bookDataRaw);
      const bookPath = path.resolve(this.fileLocation, bookId, bookData.fileType);
      if (fs.existsSync(bookPath)) {
        // Deleting right away won't work because we need download confirmation.
        fs.unlinkSync(bookPath);
        fs.renameSync(bookDataPath, path.resolve(this.historyLocation, bookId, '.json'));
        return true;
      }
    }
  }

  return false;
}

Server.prototype.uuid4 = function () {
  // https://stackoverflow.com/a/2117523
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
