$(document).ready(function() {
  var socket = io();

  var downloadButton;

  socket.on('get book', function(url) {
    console.log(url);
    $(downloadButton).replaceWith('<a download href="' + url + '" class="button is-success is-large">Download</a>');
  });

  $('.modal-background, .modal-close, .modal-card-head .delete, .modal .close').click(function() {
    $(this).closest('.modal').removeClass('is-active');
    downloadButton = undefined;
  });

  $('.modal-button').click(function() {
    var modal = $(this).data('modal');
    $('#' + modal).addClass('is-active');
  });

  $('.take-book').click(function() {
    var id = $(this).data('book');
    socket.emit('take book', id);
    downloadButton = this;
    $(this).addClass('is-loading');
  });

  $('#book').change(function() {
    var fileName = $(this).val();
    if (fileName) {
      const lastIndexOfSlash = fileName.lastIndexOf('\\');
      if (lastIndexOfSlash < 0) {
        lastIndexOfSlash = fileName.lastIndexOf('/');
      }
      fileName = fileName.substr(lastIndexOfSlash + 1);
    }
    $('#bookFileName').text(fileName ? fileName : 'None Selected');
  });
});