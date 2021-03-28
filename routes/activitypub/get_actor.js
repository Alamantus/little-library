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
      name: settings.siteTitle,
      summary: `A Little Library shelf. Give or take an ebook at <a href="https://${settings.domain}" target="_blank">https://${settings.domain}</a>`,
      url: `https://${settings.domain}/activitypub/actor`,
      inbox: `https://${settings.domain}/activitypub/inbox`,
      outbox: `https://${settings.domain}/activitypub/outbox`,
      followers: `https://${settings.domain}/activitypub/followers`,

      manuallyApprovesFollowers: false,

      publicKey: {
        id: `https://${settings.domain}/activitypub/actor#main-key`,
        owner: `https://${settings.domain}/activitypub/actor`,
        publicKeyPem: app.publicKey,
      },

      icon: {
        type: 'Image',
        mediaType: 'image/png',
        url: `https://${settings.domain}/images/icon.png`,
      },
      image: {
        type: 'Image',
        mediaType: 'image/png',
        url: `https://${settings.domain}/images/logo.png`,
      }
    });

    res.setHeader('Content-Type', 'application/activity+json');
    res.send(actor);
  });
}