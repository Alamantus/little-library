module.exports = function (app) {
  app.server.post('/give', (req, res) => {
    const resourcePath = (req.url.substr(-1) === '/' ? '../' : './');
    const { title, author, summary, contributor, source } = req.body;
    if (Object.keys(req.files).length > 0
      && req.body.hasOwnProperty('title') && title.trim() !== ''
      && req.body.hasOwnProperty('summary') && summary.trim() !== '') {
      const { book } = req.files;
      const fileType = book.name.substr(book.name.lastIndexOf('.'));
      app.addBook({ book, title, author, summary, contributor, source, fileType }, () => {
        const messageBox = app.templater.fill('./templates/elements/messageBox.html', {
          style: 'is-success',
          header: 'Upload Successful',
          message: 'Thank you for your contribution!'
        });
        const modal = app.templater.fill('./templates/elements/modal.html', {
          isActive: 'is-active',
          content: messageBox,
        });
        let body = app.templater.fill('./templates/pages/uploadForm.html', { resourcePath });
        body = app.replaceBodyWithTooManyBooksWarning(body);
        const html = app.templater.fill('./templates/htmlContainer.html', { title: 'Give a Book', resourcePath, body, modal });
        res.send(html);
      }, (err) => {
        const messageBox = app.templater.fill('./templates/elements/messageBox.html', {
          style: 'is-danger',
          header: 'Upload Failed',
          message: err,
        });
        const modal = app.templater.fill('./templates/elements/modal.html', {
          isActive: 'is-active',
          content: messageBox,
        });
        let body = app.templater.fill('./templates/pages/uploadForm.html', { resourcePath, title, author, summary, contributor, source });
        body = app.replaceBodyWithTooManyBooksWarning(body);
        const html = app.templater.fill('./templates/htmlContainer.html', { title: 'Give a Book', resourcePath, body, modal });
        res.send(html);
      });
    } else {
      let errorMessage = '';
      if (Object.keys(req.files).length <= 0) {
        errorMessage += 'You have not selected a file.';
      }
      if (!req.body.hasOwnProperty('title') || req.body.title.trim() === '') {
        errorMessage += (errorMessage.length > 0 ? '<br>' : '') + 'You have not written a title.';
      }
      if (!req.body.hasOwnProperty('summary') || req.body.summary.trim() === '') {
        errorMessage += (errorMessage.length > 0 ? '<br>' : '') + 'You have not written a summary.';
      }
      const message = app.templater.fill('./templates/elements/messageBox.html', {
        style: 'is-danger',
        header: 'Missing Required Fields',
        message: errorMessage,
      });
      let body = app.templater.fill('./templates/pages/uploadForm.html', { resourcePath, title, author, summary, contributor, source });
      body = app.replaceBodyWithTooManyBooksWarning(body);
      const html = app.templater.fill('./templates/htmlContainer.html', { title: 'Give a Book', resourcePath, body, message });
      res.send(html);
    }
  });
}