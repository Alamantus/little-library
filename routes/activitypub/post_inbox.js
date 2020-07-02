const https = require('https');
const fecha = require('fecha');
const md = require('snarkdown');

const settings = require('../../settings.json');

module.exports = function (app) {
  const followers = [];
  app.server.post('/activitypub/inbox', function (req, res) {
    console.log(req.body);
    if (req.body.type === 'Follow') {
      if (typeof req.body.actor === 'string') {
        let result;
        https.get(req.body.actor, (response) => { // https://attacomsian.com/blog/node-make-http-requests
          let data = '';

          // called when a data chunk is received.
          response.on('data', (chunk) => {
            data += chunk;
          });

          // called when the complete response is received.
          response.on('end', () => {
            result = JSON.parse(data);
            console.log(result);
          });

        }).on("error", (error) => {
          console.log("Error: ", error);
        });
      } else {
        console.log(req.body.actor);
      }
    }
    res.setHeader('Content-Type', 'application/activity+json');
    res.send({});
    return;
    
    const inbox = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      summary: 'Activities on ' + settings.siteTitle,
      type: 'OrderedCollection',
      totalItems: followers.length,
      orderedItems: followers.map(bookData => {
        bookData.author = bookData.author ? bookData.author : '<em>author not provided</em>';
        bookData.contributor = bookData.contributor ? bookData.contributor : 'Anonymous';
        let content;
        if (bookData.action === 'added') {
          content = `<p>New ${bookData.fileType} added: ${bookData.title} by ${bookData.author}</p><p>When adding, ${bookData.contributor} commented:</p><p>${md(bookData.summary)}</p>`;
        } else {
          content = `<p>The ${bookData.fileType} file of ${bookData.title} by ${bookData.author} (originally added by ${bookData.contributor}) has been removed from the shelf.</p>`;
        }
        const published = fecha.format(new Date(bookData.date), 'isoDateTime');
        return {
          id: `https://${settings.domain}/activitypub/${bookData.date}`,
          type: 'Note',
          published,
          attributedTo: `https://${settings.domain}/activitypub/actor`,
          content,
          to: 'https://www.w3.org/ns/activitystreams#Public',
        };
      }),
    });

    res.setHeader('Content-Type', 'application/activity+json');
    res.send(inbox);
  });
}