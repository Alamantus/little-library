# Little Library

A digital give-a-book, take-a-book library for ebooks.

### Features

- **Free Contribution:** allows DRM-free ebooks to be uploaded by anyone
- **Built-in Reviews:** requires a description/reason/note for uploading
- **Small Footprint:** only allows ebook files and limited metadata and optional library size limit
- **Digital Physicality:** know when you're not the only one visiting the little library
- **Single-borrower:** removes ebook files from server when someone takes it
- **Metadata history:** keeps a history of all books that have been on shelf

### Requirements

- [Node](https://nodejs.org) 11.0+

### Installation

Clone the repo:

```bash
> git clone https://github.com/Alamantus/little-library.git
```

Navigate to the folder:

```bash
> cd path/to/little-library
```

Run `npm install` or `yarn` to install all the dependencies:

```bash
> npm install
```

```bash
> yarn
```

Then copy `settings.example.json` to `settings.json` and make sure everything is to your liking. Below is the default `settings.example.json` file:

```js
{
  "port": 3000, // The server's port
  "siteTitle": "Little Library",  // The name that appears in the site header
  "titleSeparator": " | ",  // The separator for the browser bar's title between page and site titles
  "fileLocation": "./public/files/",  // The relative path to where the ebook files will be served from
  "historyLocation": "./public/history/", // The relative path to where the history metadata files will be served from
  "maxLibrarySize": 0,  // The maximum number of books that can be added to the library. 0 means unlimited
  "maxFileSize": 0, // The maximum file size of an ebook allowed to be uploaded. 0 means unlimited
  "maxHistory": 0,  // The maximum number of history metadata files that will be saved on your server. 0 means unlimited
  "allowedFormats": [".epub", ".mobi", ".pdf"], // The file formats allowed to be uploaded
  "backupPassword": "password",  // The plaintext password that allows you to access the /backup features. Be sure to change this before going live!
  "hideVisitors": false,  // If true, the "Current Visitors" counter will not update on the front end
  "sslPort": 443,  // The port to serve HTTPS content from if your private key and certificate are specified
  "sslPrivateKey": null,  // The ssl private key received from your certificate authority for HTTPS support
  "sslCertificate": null, // The ssl certificate received from your certificate authority for HTTPS support
  "sslCertificateAuthority": null,  // The ssl certificate authority (CA) received from Let's Encrypt for HTTPS support
  "forceHTTPS": false // Redirect all traffic for http to https (not sure why you wouldn't want this)
}
```

You can optionally copy the `customHtmlAfterFooter.example.html` to `customHtmlAfterFooter.html` if you want to add additional HTML to the bottom of the content container's body. This is useful for adding `<script>` snippets like what you get from [Fathom](https://github.com/usefathom/fathom) for analytics.

### Usage

Run `npm start` to start the Little Library server:

```bash
> npm start
```

Navigate to `localhost:3000` in your favorite browser to see the Little Library.

The Little Library allows anyone with access to it to give or take ebooks. I'll write a more in-depth bit about how exactly to use it when I have some more time.

### Management

There is a backup utility located at the `/backup` path when running the server, i.e. `http://localhost:3000/backup`.
In order to utilize it, you need to include your `backupPassword` in the url, like this:  
`http://localhost:3000/backup?pass=password`

This utility allows you to download a `.zip` file of all the ebook and history files on your server and then re-upload those same `.zip` files back to another server. This is helpful if you use a service like Heroku that does not persist your files when you re-upload the core script files.

### Gotchas

If you are using a proxy server like NginX, be sure your server is set to allow uploads equal to or higher than what you have specified in `maxFileSize`! In NginX, this amounts to adding `client_max_body_size 10M;` (or whatever your upload size is) to the `server` section of your `sites-enabled` entry!
