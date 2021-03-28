const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');

const settings = require('../settings.json');

module.exports = function (app) {
  const directives = helmet.contentSecurityPolicy.getDefaultDirectives();
  if (!(app.https && settings.forceHTTPS)) delete directives['upgrade-insecure-requests'];
  app.server.use(helmet({
    contentSecurityPolicy: {
      directives,
    },
  }));
  
  app.server.use(cookieParser());

  app.server.use(express.json({ type: 'application/activity+json' })); // support activity+json encoded bodies
  app.server.use(express.urlencoded({ extended: true })); // support encoded bodies

  app.server.use('/give', fileUpload({  // support file uploads
    limits: {
      fileSize: (settings.maxFileSize > 0 ? settings.maxFileSize * 1024 * 1024 : Infinity), // filesize in bytes (settings accepts MB)
    },
  }));
  app.server.use('/tools', fileUpload()); // Allow file upload on backup with no limits.

  app.server.use('/files', express.static(path.resolve('./public/files/')));
  app.server.use('/images', express.static(path.resolve('./public/images/')));
  
  app.server.get('/css/bulma.css', (req, res) => {
    if (!app.bulmaFileCache) {
      const bulmaPath = require.resolve('bulma/css/bulma.min.css');
      app.bulmaFileCache = fs.readFileSync(bulmaPath).toString('utf-8');
    }
    res.setHeader('Content-Type', 'text/css');
    res.send(app.bulmaFileCache);
  });
  app.server.use('/css', express.static(path.resolve('./public/css/')));

  app.server.use('/js', express.static(path.resolve('./public/js/')));
  app.server.get('/js/cash.js', (req, res) => {
    if (!app.cashFileCache) {
      const cashPath = require.resolve('cash-dom/dist/cash.min.js');
      app.cashFileCache = fs.readFileSync(cashPath).toString('utf-8');
    }
    res.setHeader('Content-Type', 'text/javascript');
    res.send(app.cashFileCache);
  });
  app.server.get('/js/socket.io.js', (req, res) => {
    if (!app.socketioFileCache) {
      const socketioPath = require.resolve('socket.io-client/dist/socket.io.js');
      app.socketioFileCache = fs.readFileSync(socketioPath).toString('utf-8');
    }
    res.setHeader('Content-Type', 'text/javascript');
    res.send(app.socketioFileCache);
  });

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