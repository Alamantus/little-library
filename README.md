# Little Library

A digital give-a-book, take-a-book library for ebooks.

### Features

- **Free Contribution:** allows DRM-free ebooks to be uploaded by anyone
- **Built-in Reviews:** requires a description/reason/note for uploading
- **Small Footprint:** only allows ebook files and limited metadata and optional library size limit
- **Digital Physicality:** know when you're not the only one visiting the little library
- **Single-borrower:** removes ebook files from server when someone takes it
- **Metadata History:** keeps a history of all books that have been on shelf
- **ActicityPub Support:** can be followed by social accounts in [the Fediverse](https://fediverse.party)

### Requirements

- [Node](https://nodejs.org) 12.0+

#### Optional

- [Yarn](https://yarnpkg.org) 2.0+
  - Using Yarn instead of NPM is a lot faster because the dependencies are cached within the project and accessible via its ["Plug'n'Play" installation strategy](https://yarnpkg.com/features/pnp)!

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
  "forceHTTPS": false, // Redirect all traffic for http to https (not sure why you wouldn't want this)
  "federate": true, // Enable users from other ActivityPub servers to follow this shelf and receive updates when books are added or removed (SSL/HTTPS in some form is REQUIRED, whether manually done here or via a reverse proxy)
  "domain": "localhost",  // If `federate` is true, this must be a valid domain name pointing to this server Little Library server
  "pkPassphrase": "top secret", // The plaintext password used to generate a secure key pair for signing and validating ActivityPub posts (keep it secret and DON'T CHANGE IT after your server has followers!)
  "maxResendAttempts": 10,  // The maximum number of times Little Library will attempt to send an update to a follower after failing
  "resendMinutesDelay": 6,  // The number of minutes between each re-send attempt
  "deleteFollowerAfterMaxResendFails": false  // Set to true if you want Little Library to never attempt to send an update to a failed follower again (unless they re-follow)
}
```

You can optionally copy the `customHtmlAfterFooter.example.html` to `customHtmlAfterFooter.html` if you want to add additional HTML to the bottom of the content container's body. This is useful for adding `<script>` snippets like what you get from [Fathom](https://github.com/usefathom/fathom) for analytics.

### Usage

Run `npm start` to start the Little Library server:

```bash
> npm start
```

Or if you're using Yarn, it's important you use this instead:

```bash
> yarn start
```

Navigate to `localhost:3000` in your favorite browser to see the Little Library.

Little Library allows anyone with access to it to give or take ebooks. I'll write a more in-depth bit about how exactly to use it when I have some more time.

### Management

There is a backup utility located at the `/backup` path when running the server, i.e. `http://localhost:3000/backup`.
In order to utilize it, you need to include your `backupPassword` in the url, like this:  
`http://localhost:3000/backup?pass=password`

This utility allows you to download a `.zip` file of all the ebook and history files on your server and then re-upload those same `.zip` files back to another server. This is helpful if you use a service like Heroku that does not persist your files when you re-upload the core script files.

### Gotchas

If you are using a proxy server like NginX, be sure your server is set to allow uploads equal to or higher than what you have specified in `maxFileSize`! In NginX, this amounts to adding `client_max_body_size 10M;` (or whatever your upload size is) to the `server` section of your `sites-enabled` entry!
