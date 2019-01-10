module.exports = function (app) {
  app.server.get('/give', (req, res) => {
    const resourcePath = (req.url.substr(-1) === '/' ? '../' : './');
    let body = app.fillTemplate('./templates/pages/uploadForm.html', { resourcePath });
    body = app.replaceBodyWithTooManyBooksWarning(body);

    const html = app.fillTemplate('./templates/htmlContainer.html', { title: 'Give a Book', resourcePath, body });
    res.send(html);
  });
}