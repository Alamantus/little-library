const fecha = require('fecha');

const settings = require('../../settings.json');

module.exports = function (app) {
  app.server.get('/activitypub/:id', function (req, res) {
    const bookId = parseInt(req.params.id.replace('create-', ''));
    let bookData = app.shelfCache.find(item => item.added === bookId);
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
      bookData = app.historyCache.find(item => item.time === bookId || item.added === bookId);
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

    let item = app.createActivity(bookData);
    if (req.params.id.indexOf('create-') < 0) {
      item = JSON.parse(JSON.stringify(item.object));
    }

    res.setHeader('Content-Type', 'application/activity+json');
    res.send(JSON.stringify({
      '@context': [
        'https://www.w3.org/ns/activitystreams',  // Ensure @context gets added
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
      ...item,
    }));
  });
}