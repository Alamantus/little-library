const fecha = require('fecha');
const md = require('snarkdown');

const settings = require('../../settings.json');

module.exports = function (app) {
  app.server.get('/activitypub/:id', function (req, res) {
    let bookData = app.shelfCache.find(item => item.added === parseInt(req.params.id));
    if (!!bookData) {
      bookData = {
        title: bookData.title,
        author: bookData.author,
        summary: bookData.summary,
        contributor: bookData.contributor,
        fileType: bookData.fileType,
        date: bookData.added,
        action: 'added',
      };
    }

    if (!bookData) {
      bookData = app.historyCache.find(item => item.time === parseInt(req.params.id) || item.added === parseInt(req.params.id));
      if (!!bookData) {
        bookData = {
          title: bookData.title,
          author: bookData.author,
          summary: bookData.summary,
          contributor: bookData.contributor,
          fileType: bookData.fileType,
          date: bookData.time,
          action: 'removed',
        };
      }
    }

    if (!bookData) {
      res.status(404).end();
      return;
    }

    bookData.author = bookData.author ? bookData.author : '<em>author not provided</em>';
    bookData.contributor = bookData.contributor ? bookData.contributor : 'Anonymous';
    let content;
    if (bookData.action === 'added') {
      content = `<p>New ${bookData.fileType} added: ${bookData.title} by ${bookData.author}</p><p>When adding, ${bookData.contributor} commented:</p><p>${md(bookData.summary)}</p>`;
    } else {
      content = `<p>The ${bookData.fileType} file of ${bookData.title} by ${bookData.author} (originally added by ${bookData.contributor}) has been removed from the shelf.</p>`;
    }
    const published = fecha.format(new Date(bookData.date), 'isoDateTime');
    const item = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `https://${settings.domain}/activitypub/${bookData.date}`,
      type: 'Create',
      actor: `https://${settings.domain}/activitypub/actor`,
      object: {
        id: `https://${settings.domain}/activitypub/${bookData.date}`,
        type: 'Note',
        published,
        attributedTo: `https://${settings.domain}/activitypub/actor`,
        content,
        to: [
          `https://${settings.domain}/activitypub/followers`,
          'https://www.w3.org/ns/activitystreams#Public',
        ],
      }
    });

    res.setHeader('Content-Type', 'application/activity+json');
    res.send(item);
  });
}