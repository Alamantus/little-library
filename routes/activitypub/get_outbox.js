const fecha = require('fecha');
const md = require('snarkdown');

const settings = require('../../settings.json');

module.exports = function (app) {
  app.server.get('/activitypub/outbox', function (req, res) {
    const isPage = typeof req.query.page !== 'undefined' && req.query.page === 'true';

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
    ].sort((a, b) => b.date - a.date);

    const orderedItems = bookDetails.map(bookData => {
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
        id: `https://${settings.domain}/activitypub/create-${bookData.date}`,
        type: 'Create',
        actor: `https://${settings.domain}/activitypub/actor`,
        object: {
          id: `https://${settings.domain}/activitypub/${bookData.date}`,
          type: 'Note',
          summary: null,
          inReplyTo: null,
          published,
          url: `https://${settings.domain}/activitypub/${bookData.date}`,
          attributedTo: `https://${settings.domain}/activitypub/actor`,
          content,
          contentMap: { en: content, },
          sensitive: false,
          to: [
            'https://www.w3.org/ns/activitystreams#Public',
          ],
          cc: [
            `https://${settings.domain}/activitypub/followers`,
          ],
          attachment: [],
          tag: [],
          replies: [],
        },
      };
    });
    
    const outbox = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://w3id.org/security/v1',
        {
          sc: 'http://schema.org#',
          Hashtag: 'as:Hashtag',
          sensitive: 'as:sensitive',
          commentsEnabled: 'sc:Boolean',
          capabilities: {
            announce: {
              '@type': '@id',
            },
            like: {
              '@type': '@id',
            },
          },
        },
      ],
      id: `https://${settings.domain}/activitypub/outbox`,
      summary: 'Activities on ' + settings.siteTitle,
      type: 'OrderedCollection',
    };
    if (!isPage) {
      outbox.totalItems = bookDetails.length;
      outbox.first = `https://${settings.domain}/activitypub/outbox?page=true`;
      outbox.last = `https://${settings.domain}/activitypub/outbox?page=true`;
    } else {
      outbox.id += '?page=true';
      outbox.type += 'Page';
      outbox.next = `https://${settings.domain}/activitypub/outbox?page=true`;
      outbox.prev = `https://${settings.domain}/activitypub/outbox?page=true`;
      outbox.partOf = `https://${settings.domain}/activitypub/outbox`;
      outbox.orderedItems = orderedItems;
    }

    res.setHeader('Content-Type', 'application/activity+json');
    res.send(JSON.stringify(outbox));
  });
}