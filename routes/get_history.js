const path = require('path');
const fs = require('fs');
const snarkdown = require('snarkdown');
const fecha = require('fecha');

module.exports = function (app) {
  app.server.get('/history', (req, res) => {
    const files = fs.readdirSync(app.historyLocation).filter(fileName => fileName.includes('.json'))
      .map(fileName => {  // Cache the file data so sorting doesn't need to re-check each file
        return { name: fileName, time: fs.statSync(path.resolve(app.historyLocation, fileName)).mtime.getTime() };
      }).sort((a, b) => b.time - a.time).map(v => v.name);  // Sort from newest to oldest.

    let history = files.map(fileName => {
      const bookData = JSON.parse(fs.readFileSync(path.resolve(app.historyLocation, fileName), 'utf8'));
      bookData.author = bookData.author ? bookData.author : '<em>author not provided</em>';
      bookData.contributor = bookData.contributor ? bookData.contributor : 'Anonymous';
      bookData.source = bookData.source ? `<p class="is-italic"><small>Originally retrieved from ${bookData.source}</small></p>` : '';
      
      const id = fileName.replace('.json', '');
      const added = fecha.format(new Date(bookData.added), 'hh:mm:ssA on dddd MMMM Do, YYYY');
      const removed = fecha.format(new Date(parseInt(id)), 'hh:mm:ssA on dddd MMMM Do, YYYY');
      const removedTag = '<div class="control"><div class="tags has-addons"><span class="tag">Taken</span><span class="tag is-warning">' + removed + '</span></div></div>';
      const modal = app.templater.fill('./templates/elements/modalCard.html', {
        id,
        header: '<h2 class="title">' + bookData.title + '</h2><h4 class="subtitle">' + bookData.author + '</h4>',
        content: app.templater.fill('./templates/elements/bookInfo.html', {
          contributor: bookData.contributor,
          source: bookData.source,
          fileFormat: bookData.fileType,
          added,
          removedTag,
          summary: snarkdown(bookData.summary),
        }),
        footer: '<a class="button close">Close</a>',
      });
      return app.templater.fill('./templates/elements/book_readable.html', {
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