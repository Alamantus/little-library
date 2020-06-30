const fecha = require('fecha');
const md = require('snarkdown');

const settings = require('../../settings.json');

module.exports = function (app) {
  const allFollowers = [];
  app.server.post('/activitypub/followers', function (req, res) {
    const followers = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      summary: 'Users Following ' + settings.siteTitle,
      type: 'OrderedCollection',
      totalItems: allFollowers.length,
      orderedItems: allFollowers.map(follower => {
        return {
          id: follower.actor,
          type: 'Person',
        };
      }),
    });

    res.setHeader('Content-Type', 'application/activity+json');
    res.send(followers);
  });
}