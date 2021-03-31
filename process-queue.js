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

function deleteJob(job) {
  const removeJob = app.db.prepare('DELETE FROM send_queue WHERE rowid = ?');
  try {
    removeJob.run(job.rowid);
  } catch (err) {
    console.error('Could not remove job:\n', err);
  }
}

module.exports = function (app) {
  const stmt = app.db.prepare('SELECT * FROM send_queue WHERE attempts < ? ORDER BY next_attempt LIMIT 1')
  let job;
  try {
    job = stmt.get(settings.maxResendAttempts);
  } catch (err) {
    console.error('Could not get job:\n', err);
    return false;
  }

  if (typeof job !== 'undefined') {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (job.next_attempt > nowInSeconds) return;

    const bookData = getBookData(job);
    const activity = app.createActivity(bookData);
    console.info('Sending activity:\n', activity);
    app.sendActivity(job.recipient, activity, (response) => {
      console.info('app.sendActivity response:\n', response);
      deleteJob(job);
    }, (error) => {
      console.error('app.sendActivity error:\n', error);

      if (job.attempts + 1 >= settings.maxResendAttempts) {
        deleteJob(job);

        if (settings.deleteFollowerAfterMaxResendFails) {
          let followersWithInbox;
          try {
            followersWithInbox = app.db.prepare('SELECT actor AS "id", inbox FROM followers WHERE inbox=?')
              .all(job.recipient);
          } catch (err) {
            console.error('Could not find follower in database to delete:\n', err);
          }
          if (typeof followersWithInbox !== 'undefined' && followersWithInbox.length === 1) {
            require('./actions/processUnfollow')(app, followersWithInbox[0]);
          }
        }
      } else {
        const update = app.db.prepare('UPDATE send_queue SET attempts = ?, next_attempt = ? WHERE rowid = ?');
        const inXMinutes = nowInSeconds + (settings.resendMinutesDelay * 60);
        try {
          const info = update.run(job.attempts + 1, inXMinutes, job.rowid);
          console.info(`Will re-attempt send to ${job.recipient} in ${settings.resendMinutesDelay} minutes`);
        } catch (err) {
          console.log('Could not update job for later attempt:\n', err);
        }
      }
    });
  } else {
    console.info('No more jobs, stopping the sendJob schedule')
    app.sendJob.stop();  // If there are no more new jobs, stop the cron job.
  }
};