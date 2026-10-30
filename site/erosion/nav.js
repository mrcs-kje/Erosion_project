/* Erosion.exe navigation: links marked data-random (RANDOM / OFFLINE in the
   header) lead to a random room, never the one you are on. The room is
   picked when the page opens, so the glitch-out and the creatures that
   follow you all go the same way. Load before page.js / archive.js. */
(() => {
  'use strict';
  const ROOMS = ['archive', 'room', 'game', 'loop', 'sketch', 'raw', 'random'];
  const links = document.querySelectorAll('a[data-random]');
  if (!links.length || !document.currentScript) return;
  const base = new URL('.', document.currentScript.src); // site/erosion/
  const here = location.pathname.replace(/index\.html$/, '');
  const pool = ROOMS.map((r) => new URL(r + '/index.html', base))
    .filter((u) => u.pathname.replace(/index\.html$/, '') !== here);
  links.forEach((a) => { a.href = pool[Math.floor(Math.random() * pool.length)].href; });
})();
