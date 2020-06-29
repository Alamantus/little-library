const path = require('path');
const fs = require('fs');
const snarkdown = require('snarkdown');
const fecha = require('fecha');

module.exports = function (app) {
  app.server.get('/history', (req, res) => {
    let history = app.historyCache.map(bookData => {
      bookData.author = bookData.author ? bookData.author : '<em>author not provided</em>';
      bookData.contributor = bookData.contributor ? bookData.contributor : 'Anonymous';
      const id = bookData.name.replace('.json', '');
      const added = fecha.format(new Date(bookData.added), 'hh:mm:ssA on dddd MMMM Do, YYYY');
      const removed = fecha.format(new Date(parseInt(id)), 'hh:mm:ssA on dddd MMMM Do, YYYY');
      const removedTag = '<div class="control"><div class="tags has-addons"><span class="tag">Taken</span><span class="tag is-warning">' + removed + '</span></div></div>';
      const modal = app.templater.fill('./templates/elements/modalCard.html', {
        id,
        header: '<h2 class="title">' + bookData.title + '</h2><h4 class="subtitle">' + bookData.author + '</h4>',
        content: app.templater.fill('./templates/elements/bookInfo.html', {
          contributor: bookData.contributor,
          fileFormat: bookData.fileType,
          added,
          removedTag,
          summary: snarkdown(bookData.summary),
        }),
        footer: '<a class="button close">Close</a>',
      });
      return app.templater.fill('./templates/elements/book.html', {
        id,
        title: bookData.title,
        author: bookData.author,
        fileType: bookData.fileType,
        modal,
      });
    }).join('');

    if (history == '') {
      history = '<div class="column"><div class="content">No books have been taken yet. Would you like to <a href="/">take a book</a>?</div></div>';
    }

    const body = '<h2 class="title">History</h2><div class="columns is-multiline">' + history + '</div>';
    const html = app.templater.fill('./templates/htmlContainer.html', {
      title: 'History',
      resourcePath: (req.url.substr(-1) === '/' ? '../' : './'),
      body
    });

    if (html) {
      res.send(html);
    } else {
      res.send('Something went wrong!');
    }
  });
}