$(document).ready(function() {
  var socket = io();
  
  $('.modal-background, .modal-close, .modal-card-head .delete, .modal-card-foot .close').click(function() {
    $(this).closest('.modal').removeClass('is-active');
  });

  $('.modal-button').click(function() {
    var modal = $(this).data('modal');
    $('#' + modal).addClass('is-active');
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