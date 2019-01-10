const settings = require('../../settings.json');

module.exports = function (app) {
  app.server.get('/.well-known/webfinger', function (req, res) {
    const webfinger = JSON.stringify({
      subject: `acct:shelf@${settings.domain}`,
      links: [
        {
          rel: 'self',
          type: 'application/activity+json',
          href: `https://${settings.domain}/activitypub/actor`,
        }
      ]
    });

    res.setHeader('Content-Type', 'application/activity+json');
    res.send(webfinger);
  });
}