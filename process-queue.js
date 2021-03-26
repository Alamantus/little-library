const path = require('path');
const sqlite3 = require('better-sqlite3');

module.exports = {
  firstSend: function (app) {
    try {
      const job = app.db.prepare('SELECT * FROM send_queue WHERE attempts = 0 ORDER BY last_attempt LIMIT 1').get();
      if (typeof job !== 'undefined') {
        // send
      } else {
        app.firstSendJob.stop();
      }
    } catch (err) {
      console.error(err);
    }
  },
  attemptResend: function (app) {
    try {
      const job = app.db.prepare('SELECT * FROM send_queue WHERE attempts > 0 AND attempts < 10 ORDER BY last_attempt LIMIT 1').get();
      if (typeof job !== 'undefined') {
        // send
      } else {
        app.firstSendJob.stop();
      }
    } catch (err) {
      console.error(err);
    }
  },
}