const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');

const settings = require('../settings.json');

module.exports = function (app) {
  app.server.use(helmet());
  
  app.server.use(cookieParser());

  app.server.use(bodyParser.json()); // support json encoded bodies
  app.server.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

  app.server.use('/give', fileUpload({  // support file uploads
    limits: {
      fileSize: (settings.maxFileSize > 0 ? settings.maxFileSize * 1024 * 1024 : Infinity), // filesize in bytes (settings accepts MB)
    },
  }));
  app.server.use('/tools', fileUpload()); // Allow file upload on backup with no limits.

  app.server.use('/files', express.static(path.resolve('./public/files/')));
  app.server.use('/css', express.static(path.resolve('./node_modules/bulma/css/')));
  app.server.use('/css', express.static(path.resolve('./public/css/')));
  app.server.use('/js', express.static(path.resolve('./public/js/')));
  app.server.use('/js', express.static(path.resolve('./node_modules/jquery/dist/')));
  app.server.use('/js', express.static(path.resolve('./node_modules/socket.io-client/dist/')));

  // If a `.well-known` directory exists, allow it to be used for things like Let's Encrypt challenges
  if (fs.existsSync(path.resolve('./.well-known'))) {
    app.server.use('/.well-known', express.static(path.resolve('./.well-known')));
  }

  if (app.https && settings.forceHTTPS) {
    app.server.use(function (req, res, next) {
      if (!req.secure) {
        return res.redirect(['https://', req.get('Host'), req.baseUrl].join(''));
      }
      next(); 0
    });
  }
}