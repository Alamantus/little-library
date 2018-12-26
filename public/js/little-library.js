$(document).ready(function() {
  var socket = io();
  
  $('.modal-background, .modal-close').click(function() {
    $(this).parent('.modal').removeClass('is-active');
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
  })
});