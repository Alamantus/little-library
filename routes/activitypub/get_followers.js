const settings = require('../../settings.json');

module.exports = function (app) {
  app.server.get('/activitypub/followers', function (req, res) {
    const followers = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      summary: 'Users Following ' + settings.siteTitle,
      type: 'OrderedCollection',
      totalItems: app.followersCache.length,
      orderedItems: app.followersCache,
    });

    res.setHeader('Content-Type', 'application/activity+json');
    res.send(followers);
  });
}