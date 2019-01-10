module.exports = function (app) {
  app.server.get('/about', (req, res) => {
    const resourcePath = (req.url.substr(-1) === '/' ? '../' : './');
    const body = app.templater.fill('./templates/pages/about.html', { resourcePath });
    const html = app.templater.fill('./templates/htmlContainer.html', { title: 'About', body });
    if (html) {
      res.send(html);
    } else {
      res.send('Something went wrong!');
    }
  });
}