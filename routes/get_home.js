const path = require('path');
const fs = require('fs');
const snarkdown = require('snarkdown');
const fecha = require('fecha');

const settings = require('../settings.json');

module.exports = function (app) {
  app.server.get('/', (req, res) => {
    const files = fs.readdirSync(app.fileLocation).filter(fileName => fileName.includes('.json'))
      .map(fileName => {  // Cache the file data so sorting doesn't need to re-check each file
        const stats = fs.statSync(path.resolve(app.fileLocation, fileName));
        return {
          name: fileName,
          size: stats.size / (1000 * 1000),
          time: stats.mtime.getTime(),
        };
      }).sort((a, b) => a.time - b.time);  // Sort from oldest to newest.

    let books = files.map(fileDetails => {
      const bookData = JSON.parse(fs.readFileSync(path.resolve(app.fileLocation, fileDetails.name), 'utf8'));
      if (bookData.hasOwnProperty('fileName')) return '';
      bookData.author = bookData.author ? bookData.author : '<em>author not provided</em>';
      bookData.contributor = bookData.contributor ? bookData.contributor : 'Anonymous';

      const id = fileDetails.name.replace('.json', '');
      const confirmId = 'confirm_' + id;
      const added = fecha.format(new Date(bookData.added), 'hh:mm:ssA on dddd MMMM Do, YYYY');
      const modal = app.templater.fill('./templates/elements/modalCard.html', {
        id,
        header: '<h2 class="title">' + bookData.title + '</h2><h4 class="subtitle">' + bookData.author + '</h4>',
        content: app.templater.fill('./templates/elements/bookInfo.html', {
          contributor: bookData.contributor,
          fileFormat: bookData.fileType,
          added,
          summary: snarkdown(bookData.summary),
        })
          + app.templater.fill('./templates/elements/modal.html', {
            id: confirmId,
            content: app.templater.fill('./templates/elements/messageBox.html', {
              header: 'Download Your Book',
              message: app.templater.fill('./templates/elements/takeConfirm.html', { id }),
            }),
          }),
        footer: '<a class="button close">Close</a> <a class="button is-success modal-button" data-modal="' + confirmId + '">Take Book</a>',
      });
      const maxSize = settings.maxFileSize > 0 ? settings.maxFileSize : 10;
      return app.templater.fill('./templates/elements/book.html', {
        id,
        title: bookData.title,
        author: bookData.author,
        thickness: (fileDetails.size > (maxSize * 0.3)) || (bookData.title.length > 28)
          ? 'is-thick' : (fileDetails.size < (maxSize * 0.6) ? 'is-thin' : ''),
        tallness: bookData.title.length > 16 ? 'is-tall' : (bookData.title.length < 8 ? 'is-short' : ''),
        spineColor: '#ff0000',
        textColor: '#ffffff',
        fileType: bookData.fileType,
        modal,
      });
    }).join('');

    if (books == '') {
      books = '<div class="column"><div class="content">The shelf is empty. Would you like to <a href="/give">add a book</a>?</div></div>';
    }

    const body = '<h2 class="title">Available Books</h2><div class="bookshelf columns is-gapless is-multiline">' + books + '</div>';
    const html = app.templater.fill('./templates/htmlContainer.html', {
      title: 'View',
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