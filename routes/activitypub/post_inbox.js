const https = require('https');
const path = require('path');

const settings = require('../../settings.json');

function processFollow(app, actor, followObject, success = () => {}, error = () => {}) {
  let row;
  try {
    const select = app.db.prepare('SELECT actor FROM followers WHERE actor=?');
    row = select.get(actor.id);
  } catch (e) {
    console.error(e);
  }
  if (!row) {
    console.info('Sending Accept activity');

    app.sendActivity(actor.inbox, {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `https://${settings.domain}/activitypub/actor#accepts/follows/${actor.id}`,
      summary: `${settings.siteTitle} accepted a Follow request`,
      type: 'Accept',
      actor: `https://${settings.domain}/activitypub/actor`,
      object: followObject,
    }, (response) => {
      console.log(response);
      try {
        const stmt = app.db.prepare('INSERT INTO followers VALUES (?, ?)');
        stmt.run(actor.id, Date.now());
      } catch (e) {
        console.error('Could not add follower to database:\n', e);
      }
      app.followersCache.add(actor.id);
      success();
    }, (err) => error(err));
  } else {
    error('Follower already exists');
  }
}

function processUnFollow(app, actor, success = () => {}, error = () => {}) {
  console.info('Removing follower:\n', actor);
  try {
    const removeFollower = app.db.prepare('DELETE FROM followers WHERE actor=?');
    const removedInfo = removeFollower.run(actor.id);
    if (removedInfo.changes > 0) {
      app.followersCache.delete(actor.id);
      const removeJobs = app.db.prepare('DELETE FROM send_queue WHERE recipient=?');
      removeJobs.run(actor.id);
      success();
    } else {
      error('No rows removed');
    }
  } catch (e) {
    error(e);
  }
}

// The Inbox for Little Library only accepts Follow requests and Unfollow requests (including account deletions)
module.exports = function (app) {
  app.server.post('/activitypub/inbox', function (req, res) {
    console.info('Inbox request', req.body);
    const isValidType = ['Follow', 'Undo', 'Delete'].includes(req.body.type)  // Is it the right type?
      && (req.body.type === 'Undo' ? req.body.object.type === 'Follow' : true)  // If it's an Undo, is the undo object the right type?
      && (req.body.type === 'Delete' && typeof req.body.object !== 'string' ? ['Person', 'Tombstone'].includes(req.body.object.type) : true); // If it's a Delete and the object has a type, is it valid?
    if (!isValidType) {
      console.info('Rejecting: Not a follow or unfollow request');
      return res.status(403).end();
    }

    const isValidTarget = req.body.object === `https://${settings.domain}/activitypub/actor`
      || req.body.object.object === `https://${settings.domain}/activitypub/actor`
      || (req.body.type === 'Delete' && typeof req.body.object === 'string' && req.body.object === req.body.actor);
    if (!isValidTarget) {
      // Only accept requests sent to server's actor
      console.info('Rejecting: Not addressed to server');
      return res.status(403).end();
    }
    
    if (typeof (req.headers.signature) === 'undefined') {
      // Deny any requests missing a signature
      console.info('Rejecting: No signature');
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
      console.info('Rejecting: Invalid signature header')
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
    console.info('Getting actor details');
    const actorRequest = https.request(options, (actorResponse) => { // https://attacomsian.com/blog/node-make-http-requests
      let actorData = '';

      // called when a data chunk is received.
      actorResponse.on('data', (chunk) => {
        actorData += chunk;
      });

      // called when the complete response is received.
      actorResponse.on('end', () => {
        const actor = JSON.parse(actorData);
        console.info('Actor details:', actor);
        const { publicKeyPem } = actor.publicKey;

        const isVerified = app.verifySignature(publicKeyPem, signature, comparisonString);
        if (isVerified) {
          if (req.body.type === 'Follow') {
            res.setHeader('Content-Type', 'application/activity+json');
            processFollow(app, actor, req.body.object, () => {
              console.info('Follower added');
              res.status(200).end();
            }, err => {
              console.error("Error: ", err);
              if (err == 'Follower already exists') {
                res.status(403).end();
              } else {
                res.status(500).send({
                  message: 'Something went wrong.',
                });
              }
            });
          } else {  // If it's not a Follow, then it is an unfollow/account deletion.
            processUnFollow(app, actor, () => {
              console.info('Follower removed');
              res.status(200).end();
            }, err => {
              console.error("Error: ", err);
              if (err == 'No rows removed') {
                res.status(403).end();
              } else {
                res.status(500).send({
                  message: 'Something went wrong.',
                });
              }
            });
          }
        } else {
          console.info('Rejecting: Invalid signature');
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
