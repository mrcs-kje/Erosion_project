/*
  Erosion.exe front page: an open field you drift around in.

  - The front page (.ero-main) lies where you start, exactly as it was. Every
    other page lies somewhere out in the field as a scrap (.dr-scrap), with
    debris in between. Drag, scroll or use the arrow keys to drift.
  - Items are placed by data-x / data-y, in px from the front page's top left
    corner. The field wraps around (a torus, like the drawing dump), so it
    never ends and you always come back around.
  - Clicking a scrap first drifts it to the middle of the window, then the
    page glitches out to it (erosion.js handles the leaving).
  Load BEFORE erosion.js, so this click comes first.
*/
(() => {
  'use strict';

  const field = document.getElementById('field');
  if (!field) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('.ero-header');
  const grid = field.querySelector('.dr-grid');
  const readout = document.querySelector('.dr-coords');
  const f = (n) => Math.round(n * 10) / 10;
  const wrap = (v, m) => ((v % m) + m) % m;

  const items = [...field.querySelectorAll('.dr-item')].map((el) => ({
    el, x: +el.dataset.x || 0, y: +el.dataset.y || 0, w: 0, h: 0,
  }));
  const top = header ? header.offsetHeight : 0;
  let TW = 0, TH = 0;
  function measure() {
    for (const it of items) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; }
    const home = items[0];
    // big enough that nothing shows twice at once
    TW = Math.max(5600, window.innerWidth * 2 + 1600);
    TH = Math.max(4200, home.h + window.innerHeight * 2 + 800);
  }
  measure();

  // ---- The camera -----------------------------------------------------------
  const cam = { x: 0, y: -top }, vel = { x: 0, y: 0 };
  let goal = null, then = null, lastCam = { x: cam.x, y: cam.y };

  // Where an item is on screen: of its two copies (here and one lap back), the one that can be seen.
  function screenPos(it) {
    const vw = window.innerWidth, vh = window.innerHeight;
    let sx = wrap(it.x - cam.x, TW), sy = wrap(it.y - cam.y, TH);
    if (sx > vw && sx - TW + it.w > -200) sx -= TW;
    if (sy > vh && sy - TH + it.h > -200) sy -= TH;
    return [sx, sy];
  }

  function render() {
    for (const it of items) {
      const [sx, sy] = screenPos(it);
      it.el.style.transform = 'translate3d(' + f(sx) + 'px,' + f(sy) + 'px,0)';
    }
    if (grid) grid.style.backgroundPosition = f(-wrap(cam.x, 120)) + 'px ' + f(-wrap(cam.y, 120)) + 'px,' + f(-wrap(cam.x, 600)) + 'px ' + f(-wrap(cam.y, 600)) + 'px';
    if (readout) {
      const c = (n) => (n < 0 ? '-' : '') + String(Math.abs(Math.round(n))).padStart(4, '0');
      readout.textContent = 'X ' + c(wrap(cam.x, TW)) + '  Y ' + c(-wrap(cam.y + top, TH));
    }
  }

  let looping = false;
  function loop() {
    if (goal) {
      const k = reduce.matches ? 1 : 0.1;
      cam.x += (goal.x - cam.x) * k; cam.y += (goal.y - cam.y) * k;
      if (Math.abs(goal.x - cam.x) + Math.abs(goal.y - cam.y) < 1) {
        cam.x = goal.x; cam.y = goal.y; goal = null;
        if (then) { const t = then; then = null; t(); }
      }
    } else if (!drag.on && (Math.abs(vel.x) + Math.abs(vel.y) > 0.05)) {
      cam.x += vel.x; cam.y += vel.y;
      vel.x *= 0.93; vel.y *= 0.93;
    }
    const moved = cam.x !== lastCam.x || cam.y !== lastCam.y;
    lastCam = { x: cam.x, y: cam.y };
    if (moved) render();
    if (document.hidden || (!moved && !goal && !drag.on)) { looping = false; return; }
    requestAnimationFrame(loop);
  }
  function go() { if (!looping) { looping = true; requestAnimationFrame(loop); } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) go(); });
  window.addEventListener('resize', () => { measure(); render(); });

  // Bring an item to the middle of the window (the shortest way round).
  function centre(it, after) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const [sx, sy] = screenPos(it);
    goal = { x: cam.x + sx + Math.min(it.w, vw) / 2 - vw / 2, y: cam.y + sy + Math.min(it.h, vh) / 2 - vh / 2 };
    then = after || null;
    vel.x = vel.y = 0;
    go();
  }

  // ---- Moving around --------------------------------------------------------------
  const drag = { on: false, down: false, x: 0, y: 0, sx: 0, sy: 0, t: 0, id: null, swallow: false };
  field.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    Object.assign(drag, { down: true, on: false, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), id: e.pointerId });
    vel.x = vel.y = 0; goal = null; then = null;
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag.down || e.pointerId !== drag.id) return;
    if (!drag.on && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
      drag.on = true;
      field.classList.add('dr-grabbing');
      try { field.setPointerCapture(e.pointerId); } catch (_) { /* fine without */ }
    }
    if (!drag.on) return;
    const now = performance.now(), dt = Math.max(1, now - drag.t);
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    cam.x -= dx; cam.y -= dy;
    vel.x = vel.x * 0.4 + (-dx / dt * 16) * 0.6; vel.y = vel.y * 0.4 + (-dy / dt * 16) * 0.6;
    drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
    go();
  });
  const up = (e) => {
    if (!drag.down || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    if (drag.on) {
      drag.swallow = true;
      setTimeout(() => { drag.swallow = false; }, 0);
      if (performance.now() - drag.t > 90 || reduce.matches) vel.x = vel.y = 0;
    }
    drag.down = drag.on = false;
    field.classList.remove('dr-grabbing');
    go();
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  // A drag that ends on a link is not a click. A click on a scrap far from the
  // middle drifts it there first, then lets the click through.
  let passing = false;
  window.addEventListener('click', (e) => {
    if (drag.swallow) { e.preventDefault(); e.stopImmediatePropagation(); drag.swallow = false; return; }
    if (passing || reduce.matches || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const a = e.target.closest && e.target.closest('.dr-field a[href]');
    const it = a && items.find((i) => i.el.contains(a));
    if (!it || it === items[0]) return;
    e.preventDefault(); e.stopImmediatePropagation();
    centre(it, () => { passing = true; a.click(); passing = false; });
  }, true);

  field.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // pinch zoom stays the browser's
    e.preventDefault();
    const k = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? window.innerHeight : 1;
    let dx = e.deltaX * k, dy = e.deltaY * k;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    cam.x += dx; cam.y += dy; goal = null; then = null; vel.x = vel.y = 0;
    go();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || /input|textarea|select/i.test(e.target.tagName)) return;
    const step = e.shiftKey ? 600 : 220;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    const from = goal || cam;
    goal = { x: from.x + m[0], y: from.y + m[1] }; then = null;
    vel.x = vel.y = 0;
    go();
  });

  // Tabbing to a scrap brings it to the middle of the window.
  field.addEventListener('focusin', (e) => {
    const it = items.find((i) => i.el.contains(e.target));
    if (it === items[0]) { goal = { x: it.x, y: it.y - top }; then = null; go(); } // home, as it was
    else if (it) centre(it);
    field.scrollLeft = field.scrollTop = 0;
  });
  field.addEventListener('scroll', () => { field.scrollLeft = field.scrollTop = 0; });

  render();
})();
