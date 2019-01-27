const path = require('path');
const fs = require('fs');

const settings = require('../settings.json');

module.exports = function (app) {
  app.server.get('/tools', (req, res) => {
    if (req.query.pass === settings.toolsPassword) {
      const templateValues = {};
      let html = app.templater.fill('./templates/pages/tools.html', templateValues);

      if (req.query.do && ['resetVisitors'].includes(req.query.do)) {
        app.connections = 0;
        templateValues.resetVisitors = 'Done!';
        html = app.templater.fill('./templates/pages/tools.html', templateValues);
        res.send(html);
      } else if (req.query.dl && ['files', 'history'].includes(req.query.dl)) {
        const onezip = require('onezip');
        const { dl } = req.query;
        const saveLocation = path.resolve(app.fileLocation, dl + 'Backup.zip');
        const backupLocation = dl === 'history' ? app.historyLocation : app.fileLocation;
        const files = fs.readdirSync(backupLocation).filter(fileName => !fileName.includes('.zip'));
        onezip.pack(backupLocation, saveLocation, files)
          .on('start', () => {
            console.info('Starting a backup zip of ' + dl)
          })
          .on('error', (error) => {
            console.error(error);
            templateValues[dl + 'Download'] = 'Something went wrong: ' + JSON.stringify(error);
            html = app.templater.fill('./templates/pages/tools.html', templateValues);
            res.send(html);
          })
          .on('end', () => {
            console.log('Backup complete. Saved to ' + saveLocation);
            let backupLocation = saveLocation.replace(/\\/g, '/');
            backupLocation = backupLocation.substr(backupLocation.lastIndexOf('/'));
            templateValues[dl + 'Download'] = '<a download href="' + encodeURI('./files' + backupLocation) + '">Download</a> (This will be removed from the server in 1 hour)';
            html = app.templater.fill('./templates/pages/tools.html', templateValues);
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
}