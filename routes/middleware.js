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

  // Opt out of Google Chrome tracking everything you do.
  // Note: if you’re reading this, stop using Google Chrome.
  // It is ridiculous for web servers to essentially have to ask
  // “please do not violate the privacy of the people who are viewing
  // this site” with every request.
  // For more info, see: https://plausible.io/blog/google-floc
  app.server.use((request, response, next) => {
    response.set('Permissions-Policy', 'interest-cohort=()');
    next();
  });
  
  app.server.use(cookieParser());

  app.server.use(express.json()); // support json encoded bodies
  app.server.use(express.urlencoded({ extended: true })); // support encoded bodies

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
  app.server.use('/js', express.static(path.resolve('./node_modules/cash-dom/dist/')));
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
