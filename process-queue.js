const path = require('path');
const fs = require('fs');
const sqlite3 = require('better-sqlite3');

module.exports = {
  firstSend: function (app) {
    try {
      const job = app.db.prepare('SELECT * FROM send_queue WHERE attempts = 0 ORDER BY last_attempt LIMIT 1').get();
      if (typeof job !== 'undefined') {
        const savedBookData = JSON.parse(fs.readFileSync(job.data).toString('utf-8'));
        const bookData = {
          title: savedBookData.title,
          author: savedBookData.author,
          summary: savedBookData.summary,
          contributor: savedBookData.contributor,
          fileType: savedBookData.fileType,
          date: savedBookData.added,
          action: 'added',
        };
      } else {
        app.firstSendJob.stop();  // If there are no more new jobs, stop the cron job.
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
        app.attemptResendJob.stop();
      }
    } catch (err) {
      console.error(err);
    }
  },
}