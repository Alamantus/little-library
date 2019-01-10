const path = require('path');
const fs = require('fs');

module.exports = function (app) {
  app.server.post('/tools', (req, res) => {
    if (req.query.pass === settings.toolsPassword) {
      const templateValues = {};
      let html = app.templater.fill('./templates/pages/tools.html', templateValues);

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
              html = app.templater.fill('./templates/pages/tools.html', templateValues);
              res.send(html);
            } else {
              onezip.extract(uploadPath, path.resolve('./public', backupType))
                .on('start', () => {
                  console.info('Extracting file ' + uploadPath)
                })
                .on('error', (error) => {
                  console.error(error);
                  templateValues[backupType + 'UploadSuccess'] = 'Something went wrong: ' + JSON.stringify(error);
                  html = app.templater.fill('./templates/pages/tools.html', templateValues);
                  res.send(html);
                })
                .on('end', () => {
                  templateValues[backupType + 'UploadSuccess'] = 'Uploaded Successfully!';
                  html = app.templater.fill('./templates/pages/tools.html', templateValues);
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
          html = app.templater.fill('./templates/pages/tools.html', templateValues);
          res.send(html);
        }
      } else {
        res.send(html);
      }
    } else {
      res.status(400).send();
    }
  });
}