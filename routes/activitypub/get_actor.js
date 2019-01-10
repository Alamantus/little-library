const settings = require('../../settings.json');

module.exports = function (app) {
  app.server.get('/activitypub/actor', function (req, res) {
    const actor = JSON.stringify({
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://w3id.org/security/v1',
      ],

      id: `https://${settings.domain}/activitypub/actor`,
      type: 'Person',
      preferredUsername: 'shelf',
      inbox: `https://${settings.domain}/activitypub/inbox`,
      outbox: `https://${settings.domain}/activitypub/outbox`,

      publicKey: {
        id: `https://${settings.domain}/activitypub/actor#main-key`,
        owner: `https://${settings.domain}/activitypub/actor`,
        publicKeyPem: settings.publicKey,
      }
    });

    res.setHeader('Content-Type', 'application/activity+json');
    res.send(actor);
  });
}