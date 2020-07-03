const https = require('https');
const crypto = require('crypto');

const fecha = require('fecha');
const md = require('snarkdown');

const settings = require('../../settings.json');

module.exports = function (app) {
  app.server.post('/activitypub/inbox', function (req, res) {
    if (req.body.type !== 'Follow') {
      // Only accept follow requests
      return res.status(403).end();
    }
    
    if (typeof (req.headers.signature) === 'undefined') {
      // Deny any requests missing a signature
      return res.status(403).end();
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
      return res.status(403).end();
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
    
    console.log('follow headers:', req.headers);
    console.log('follow body:', req.body);
    
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
          return res.status(405).send({  // Temporary failure for testing only!
            message: 'success',
          });

          const followerUrl = new URL(actor.inbox);
          const options = {
            protocol: followerUrl.protocol,
            hostname: followerUrl.hostname,
            port: followerUrl.port,
            path: followerUrl.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/activity+json',
            }
          }
          acceptRequest = https.request(options, (acceptResponse) => {
            let acceptData = '';

            // called when a data chunk is received.
            actorResponse.on('data', (chunk) => {
              acceptData += chunk;
            });

            // called when the complete response is received.
            actorResponse.on('end', () => {
              console.log(acceptData);
            });
          }).on("error", (error) => {
            console.error("Error: ", error);
            res.status(500).send({
              message: 'Something went wrong.',
            });
          });

          // acceptRequest.write(JSON.stringify({
          //   "@context": "https://www.w3.org/ns/activitystreams",
          //   "summary": "Sally accepted an invitation to a party",
          //   "type": "Accept",
          //   "actor": `https://${settings.domain}/activitypub/actor`,
          //   "object": req.body.object,
          // }));
          // acceptRequest.end();
        } else {
          res.status(403).send({
            message: 'failure',
          });
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