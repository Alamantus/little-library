const https = require('https');
const path = require('path');

const settings = require('../../settings.json');

module.exports = function (app) {
  app.server.post('/activitypub/inbox', function (req, res) {
    if (req.body.type !== 'Follow' || req.body.object !== `https://${settings.domain}/activitypub/actor`) {
      // Only accept follow requests
      return res.status(403).end();
    }
    
    if (typeof (req.headers.signature) === 'undefined') {
      // Deny any requests missing a signature
      return res.status(403).send('Request not signed');
    }

    const signatureHeader = {};
    req.headers.signature.split(',').map(piece => {
      return piece.split('=').map(part => part.replace(/^"(.+?)"$/, '$1')); // Remove outer quotes
    }).forEach(pair => {
      signatureHeader[pair[0]] = pair[1];
    });

    if (typeof (signatureHeader.keyId) === 'undefined'
      || typeof (signatureHeader.headers) === 'undefined'
      || typeof (signatureHeader.signature) === 'undefined') {
      // Deny any invalid Signature header
      return res.status(403).send('Request not signed');
    }

    // Get the signature
    const { signature } = signatureHeader;
    
    // Build the original string that was signed.
    const comparisonString = signatureHeader.headers.split(' ').map(signedHeaderName => {
      if (signedHeaderName === '(request-target)') {
        return '(request-target): post /activitypub/inbox';
      }
      return `${signedHeaderName}: ${req.headers[signedHeaderName.toLowerCase()]}`;
    }).join('\n');

    const actorUrl = new URL(signatureHeader.keyId);
    const options = {
      protocol: actorUrl.protocol,
      hostname: actorUrl.hostname,
      port: actorUrl.port,
      path: actorUrl.pathname,
      method: 'GET',
      headers: {
        'Accept': 'application/activity+json',
      }
    }
    
    res.setHeader('Content-Type', 'application/activity+json');
    const actorRequest = https.request(options, (actorResponse) => { // https://attacomsian.com/blog/node-make-http-requests
      let actorData = '';

      // called when a data chunk is received.
      actorResponse.on('data', (chunk) => {
        actorData += chunk;
      });

      // called when the complete response is received.
      actorResponse.on('end', () => {
        const actor = JSON.parse(actorData);
        const { publicKeyPem } = actor.publicKey;

        const isVerified = app.verifySignature(publicKeyPem, signature, comparisonString);
        if (isVerified) {
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
              summary: `${settings.siteTitle} accepted a Follow request`,
              type: 'Accept',
              actor: `https://${settings.domain}/activitypub/actor`,
              object: req.body.object,
            }, (response) => {
              console.log(response);
                const stmt = app.db.prepare('INSERT INTO followers VALUES (?, ?)');
                stmt.run(actor.id, Date.now());
                app.followersCache.unshift(actor.id); // Put new follower at front of array
                res.status(200).end();
            }, (error) => {
              console.error("Error: ", error);
              res.status(500).send({
                message: 'Something went wrong.',
              });
            });
          } else {
            console.log('Follower already exists');
            res.status(403).end();
          }
        } else {
          res.status(403).send('Invalid signature');
        }
      });
    }).on("error", (error) => {
      console.error("Error: ", error);
      res.status(500).send({
        message: 'Something went wrong.',
      });
    });

    return actorRequest.end();
  });
}
