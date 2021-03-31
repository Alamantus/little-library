const settings = require('../settings.json');

module.exports = function (app, actor, followObject, success = () => {}, error = () => {}) {
  let row;
  try {
    const select = app.db.prepare('SELECT actor FROM followers WHERE actor=?');
    row = select.get(actor.id);
  } catch (e) {
    console.error(e);
  }
  if (!row) {
    app.sendActivity(actor.inbox, {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `https://${settings.domain}/activitypub/actor#accepts/follows/${actor.id}`,
      type: 'Accept',
      actor: `https://${settings.domain}/activitypub/actor`,
      object: followObject,
    }, (response) => {
      console.log(response);
      try {
        const stmt = app.db.prepare('INSERT INTO followers (actor, inbox, created) VALUES (?, ?, ?)');
        stmt.run(actor.id, actor.inbox, Date.now());
      } catch (e) {
        console.error('Could not add follower to database:\n', e);
      }
      app.followersCache[actor.id] = actor.inbox;
      success();
    }, (err) => error(err));
  } else {
    error('Follower already exists');
  }
}