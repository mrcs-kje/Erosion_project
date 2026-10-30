/* Piece 07: the video facade never loads. It was eroded. */
(() => {
  'use strict';
  const vid = document.getElementById('rp-vid');
  const label = document.getElementById('rp-vid-label');
  vid.addEventListener('click', () => {
    vid.classList.add('is-gone');
    label.textContent = 'VIDEO / NOT FOUND / IT WAS ERODED';
  });
})();
