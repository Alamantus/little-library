const path = require('path');
const fs = require('fs');

const settings = require('../settings.json');

module.exports = class {
  constructor (app) {
    this.app = app;
    this.cache = {};
  }

  fill (file, templateVars = {}) {
    let data;
    if (this.cache.hasOwnProperty(file)) {
      data = this.cache[file];
    } else {
      data = fs.readFileSync(path.resolve(file), 'utf8');
    }
    if (data) {
      if (!this.cache.hasOwnProperty(file)) {
        this.cache[file] = data;
      }

      let filledTemplate = data.replace(/\{\{siteTitle\}\}/g, settings.siteTitle)
        .replace(/\{\{titleSeparator\}\}/g, settings.titleSeparator)
        .replace(/\{\{allowedFormats\}\}/g, settings.allowedFormats.join(','))
        .replace(/\{\{maxFileSize\}\}/g, (settings.maxFileSize > 0 ? settings.maxFileSize + 'MB' : 'no'));

      if (fs.existsSync(path.resolve('./customHtmlAfterFooter.html'))) {
        const customHtmlAfterFooter = fs.readFileSync(path.resolve('./customHtmlAfterFooter.html'));
        filledTemplate = filledTemplate.replace(/\{\{customHtmlAfterFooter\}\}/g, customHtmlAfterFooter);
      }

      for (let templateVar in templateVars) {
        const regExp = new RegExp('\{\{' + templateVar + '\}\}', 'g')
        filledTemplate = filledTemplate.replace(regExp, templateVars[templateVar]);
      }

      // If any template variable is not provided, don't even render them.
      filledTemplate = filledTemplate.replace(/\{\{[a-zA-Z0-9\-_]+\}\}/g, '');

      return filledTemplate;
    }

    return data;
  }
}