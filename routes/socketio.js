const settings = require('../settings.json');

module.exports = function (app) {
  app.io.on('connection', socket => {
    if (!settings.hideVisitors) {
      app.connections++;
      app.io.emit('update visitors', app.connections);
    }

    socket.on('take book', bookId => {
      const fileLocation = app.takeBook(bookId, socket.id);
      if (fileLocation) {
        console.log(socket.id + ' removed ' + bookId);
        const downloadLocation = fileLocation.substr(fileLocation.lastIndexOf('/'));
        socket.emit('get book', encodeURI('./files' + downloadLocation));
        socket.broadcast.emit('remove book', bookId);
      }
    });

    socket.on('disconnect', () => {
      if (!settings.hideVisitors) {
        app.connections--;
        if (app.connections < 0) app.connections = 0;
        app.io.emit('update visitors', app.connections);
      }
      app.deleteBooks(socket.id);
    });
  });
}