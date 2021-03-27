const path = require('path');
const fs = require('fs');
const sqlite3 = require('better-sqlite3');

const settings = require('./settings.json');

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

module.exports = function (app) {
  try {
    const job = app.db.prepare('SELECT * FROM send_queue WHERE attempts < ? ORDER BY next_attempt LIMIT 1')
      .get(settings.maxResendAttempts);
    if (typeof job !== 'undefined') {
      const now = Math.floor(Date.now() / 1000);
      if (job.next_attempt > now) return;

      const bookData = getBookData(job);
      const activity = app.createActivity(bookData);
      console.info('Sending activity:\n', activity);
      res.setHeader('Content-Type', 'application/activity+json');
      app.sendActivity(job.recipient, activity, (response) => {
        console.info('app.sendActivity response:\n', response);
        const removeJob = app.db.prepare('DELETE FROM send_queue WHERE rowid = ?');
        removeJob.run(job.rowid);
      }, (error) => {
        console.error('app.sendActivity error:\n', error);
        const update = app.db.prepare('UPDATE send_queue SET attempts = ?, next_attempt = ? WHERE rowid = ?');
        const in2Minutes = now + (settings.resendMinutesDelay * 60);
        const info = update.run(job.attempts + 1, in2Minutes, job.rowid);
        console.info(`Will re-attempt send to ${job.recipient} in ${settings.resendMinutesDelay} minutes`);
      });
    } else {
      console.info('No more jobs, stopping the sendJob schedule')
      app.sendJob.stop();  // If there are no more new jobs, stop the cron job.
    }
  } catch (err) {
    console.error(err);
  }
};