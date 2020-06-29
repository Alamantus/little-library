const fecha = require('fecha');
const md = require('snarkdown');

const settings = require('../../settings.json');

module.exports = function (app) {
  app.server.get('/activitypub/outbox', function (req, res) {
    const addedBooks = [...app.shelfCache, ...app.historyCache].map(bookData => {
      return {
        title: bookData.title,
        author: bookData.author,
        summary: bookData.summary,
        contributor: bookData.contributor,
        fileType: bookData.fileType,
        date: bookData.added,
        action: 'added',
      };
    });
    const historyBooks = app.historyCache.map(bookData => {
      return {
        title: bookData.title,
        author: bookData.author,
        summary: bookData.summary,
        contributor: bookData.contributor,
        fileType: bookData.fileType,
        date: bookData.time,
        action: 'removed',
      };
    });

    const bookDetails = [
      ...addedBooks,
      ...historyBooks,
    ].sort((a, b) => a.date - b.date);
    
    const outbox = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      summary: 'Activities on ' + settings.siteTitle,
      type: 'OrderedCollection',
      totalItems: bookDetails.length,
      orderedItems: bookDetails.map(bookData => {
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
    res.send(outbox);
  });
}