/* Room 3: lines a visitor adds to the essay. They are kept for this browser
   tab only (sessionStorage) and become food for the creatures. */
(() => {
  'use strict';
  const KEY = 'ero-room3-lines';
  const form = document.getElementById('room-form');
  const input = document.getElementById('room-input');
  const box = document.getElementById('room-lines');
  let lines = [];
  try { lines = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (_) { lines = []; }

  function add(text, save) {
    const p = document.createElement('p');
    p.textContent = text;
    box.append(p);
    if (window.ERO && ERO.feed) ERO.feed(p);
    if (save) {
      lines.push(text);
      try { sessionStorage.setItem(KEY, JSON.stringify(lines.slice(-20))); } catch (_) { /* storage blocked */ }
    }
  }
  lines.forEach((t) => add(t, false));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    add(text, true);
    input.value = '';
  });
})();
