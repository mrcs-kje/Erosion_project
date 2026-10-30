/* Erosion.exe: relics you kept in the dark (unspecified game, phase 02) turn
   up on this page, each somewhere new on every visit. Click one for its lore.
   Needs relics.js first. Kept relics live in this browser only ("ero-relics"). */
(() => {
  'use strict';
  const all = window.EROSION_RELICS || [];
  let kept = [];
  try { kept = JSON.parse(localStorage.getItem('ero-relics')) || []; } catch (_) { /* storage blocked: nothing kept */ }
  const found = kept.map((k) => all.find((r) => r.id === k.id)).filter(Boolean);
  if (!found.length) return;

  const layer = document.createElement('div');
  layer.className = 'relic-layer';
  document.body.appendChild(layer);

  const dialog = document.createElement('dialog');
  dialog.className = 'relic-pop';
  dialog.innerHTML = '<p class="relic-pop-glyph" aria-hidden="true"></p><h2 class="relic-pop-name"></h2><p class="relic-pop-lore"></p><form method="dialog"><button type="submit">[ PUT IT BACK ]</button></form>';
  document.body.appendChild(dialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // click outside closes

  // spread over the whole page, a little away from the edges
  const height = Math.max(document.documentElement.scrollHeight, window.innerHeight);
  found.forEach((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'relic';
    b.textContent = r.glyph;
    b.setAttribute('aria-label', 'Kept relic: ' + r.name.toLowerCase());
    b.style.left = (4 + Math.random() * 88) + '%';
    b.style.top = Math.round(80 + Math.random() * (height - 160)) + 'px';
    b.style.animationDelay = (-Math.random() * 9).toFixed(2) + 's';
    b.style.setProperty('--drift', (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 14) + 'px');
    b.addEventListener('click', () => {
      dialog.querySelector('.relic-pop-glyph').textContent = r.glyph;
      dialog.querySelector('.relic-pop-name').textContent = r.name;
      dialog.querySelector('.relic-pop-lore').textContent = r.lore;
      dialog.showModal();
    });
    layer.appendChild(b);
  });
})();
