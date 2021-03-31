module.exports = function (app, actor, success = () => {}, error = () => {}) {
  try {
    const removeFollower = app.db.prepare('DELETE FROM followers WHERE actor=?');
    const removedInfo = removeFollower.run(actor.id);
    if (removedInfo.changes > 0) {
      delete app.followersCache[actor.id];
      const removeJobs = app.db.prepare('DELETE FROM send_queue WHERE recipient=?');
      removeJobs.run(actor.inbox);
      success();
    } else {
      error('No rows removed');
    }
  } catch (e) {
    error(e);
  }
}