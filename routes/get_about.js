module.exports = function (app) {
  app.server.get('/about', (req, res) => {
    const resourcePath = (req.url.substr(-1) === '/' ? '../' : './');
    const body = app.fillTemplate('./templates/pages/about.html', { resourcePath });
    const html = app.fillTemplate('./templates/htmlContainer.html', { title: 'About', body });
    if (html) {
      res.send(html);
    } else {
      res.send('Something went wrong!');
    }
  });
}