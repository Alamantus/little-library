const path = require('path');
const fs = require('fs');
const sqlite3 = require('better-sqlite3');

function getBookData(job) {
  const savedBookData = JSON.parse(fs.readFileSync(job.data).toString('utf-8'));
  return {
    title: savedBookData.title,
    author: savedBookData.author,
    summary: savedBookData.summary,
    contributor: savedBookData.contributor,
    fileType: savedBookData.fileType,
    date: savedBookData.added,
    action: job.action,
  };
}

module.exports = {
  firstSend: function (app) {
    try {
      const job = app.db.prepare('SELECT * FROM send_queue WHERE attempts = 0 ORDER BY last_attempt LIMIT 1').get();
      if (typeof job !== 'undefined') {
        const bookData = getBookData(job);
        const activity = app.createActivity(bookData);
        app.sendActivity(job.recipient, activity, (response) => {
          console.log(response);
          const removeJob = app.db.prepare('DELETE FROM send_queue WHERE rowid = ?');
          removeJob.run(job.rowid);
        }, (error) => {
          const update = app.db.prepare('UPDATE send_queue SET attempts = 1, last_attempt = ? WHERE rowid = ?');
          const info = update.run(Date.now(), job.rowid);
          console.log('Will re-attempt send to ' + job.recipient, info);
        });
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
        const bookData = getBookData(job);
        const activity = app.createActivity(bookData);
        app.sendActivity(job.recipient, activity, (response) => {
          console.log(response);
          const removeJob = app.db.prepare('DELETE FROM send_queue WHERE rowid = ?');
          removeJob.run(job.rowid);
        }, (error) => {
          if (job.attempts < 10) {
            const update = app.db.prepare('UPDATE send_queue SET attempts = ?, last_attempt = ? WHERE rowid = ?');
            const info = update.run(job.attempts + 1, Date.now(), job.rowid);
            console.log('Will re-attempt send to ' + job.recipient, info);
          } else {
            const removeJob = app.db.prepare('DELETE FROM send_queue WHERE rowid = ?');
            removeJob.run(job.rowid);
            console.log('Giving up on sending to ' + job.recipient, info);
          }
        });
      } else {
        app.attemptResendJob.stop();
      }
    } catch (err) {
      console.error(err);
    }
  },
}