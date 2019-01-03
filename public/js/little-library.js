$(document).ready(function() {
  var socket = io();

  var downloadButton;

  socket.on('get book', function(url) {
    $(downloadButton).replaceWith('<a download href="' + url + '" class="button is-success is-large">Download</a>');
  });

  socket.on('remove book', function(bookId) {
    var book = $('#book_' + bookId);
    var modal = $('<div class="modal is-active"><div class="modal-background"></div><div class="modal-content"><button class="modal-close"></button><div class="notification is-danger"><h2 class="title">Sorry!</h2><p>Someone took the book you were looking at.</h2></div></div></div>');
    modal.find('.modal-background, .modal-close').click(function() {
      modal.remove();
    });
    book.after(modal);
    book.remove();
  });

  $('.navbar-burger').click(function() {
    if ($(this).hasClass('is-active')) {
      $(this).removeClass('is-active');
      $(this).attr('aria-expanded', 'false');
      $('.navbar-menu').removeClass('is-active');
    } else {
      $(this).addClass('is-active');
      $(this).attr('aria-expanded', 'true');
      $('.navbar-menu').addClass('is-active');
    }
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
    $('#book_' + id).find('.box')
      .removeClass('box').addClass(['notification', 'is-success'])
      .attr('title', 'This can be downloaded until you leave this page');
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