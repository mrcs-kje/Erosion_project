/* Loop 012: twelve seconds of walking down a corridor toward a red door
   that never gets closer. Then it starts again, and the loop count goes up.
   The door is a link. With reduced motion it is one still frame. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1100, H = 600, LEN = 12000, RINGS = 5;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const rings = $('loop-rings'), edges = $('loop-edges'), door = $('loop-door'), knob = $('loop-knob');
  const bar = $('loop-bar'), time = $('loop-time'), nEl = $('loop-n');
  const ringEls = [], edgeEls = [];
  for (let i = 0; i < RINGS; i++) { const r = document.createElementNS(NS, 'rect'); rings.append(r); ringEls.push(r); }
  for (let i = 0; i < 6; i++) { const l = document.createElementNS(NS, 'line'); edges.append(l); edgeEls.push(l); }
  let loops = 12, start = performance.now(), lastLoop = 0;

  const box = (s) => ({ w: W * s, h: H * s, x: (W - W * s) / 2, y: (H - H * s) / 2 + H * s * 0.02 });
  function rect(el, b) { el.setAttribute('x', b.x.toFixed(1)); el.setAttribute('y', b.y.toFixed(1)); el.setAttribute('width', b.w.toFixed(1)); el.setAttribute('height', b.h.toFixed(1)); }
  function line(el, x1, y1, x2, y2) { el.setAttribute('x1', x1); el.setAttribute('y1', y1); el.setAttribute('x2', x2.toFixed(1)); el.setAttribute('y2', y2.toFixed(1)); }

  function frame(t) {
    const k = (t % LEN) / LEN;
    // The far wall breathes a little: you walk, but it does not come closer.
    const back = box(0.19 + 0.012 * Math.sin(k * Math.PI * 2));
    ringEls.forEach((el, i) => {
      const f = ((i + k * 2) % RINGS) / RINGS;             // 0 far ... 1 near
      rect(el, box(0.19 + (1 - 0.19) * f * f));
      el.setAttribute('opacity', (f * 0.9).toFixed(2));
    });
    line(edgeEls[0], 0, 0, back.x, back.y);
    line(edgeEls[1], W, 0, back.x + back.w, back.y);
    line(edgeEls[2], 0, H, back.x, back.y + back.h);
    line(edgeEls[3], W, H, back.x + back.w, back.y + back.h);
    line(edgeEls[4], back.x, back.y, back.x + back.w, back.y);
    line(edgeEls[5], back.x, back.y + back.h, back.x + back.w, back.y + back.h);
    const dw = back.w * 0.42, dh = back.h * 0.8;
    rect(door, { x: W / 2 - dw / 2, y: back.y + back.h - dh, w: dw, h: dh });
    knob.setAttribute('cx', (W / 2 + dw * 0.33).toFixed(1));
    knob.setAttribute('cy', (back.y + back.h - dh * 0.5).toFixed(1));
    bar.style.width = (k * 100).toFixed(1) + '%';
    time.textContent = '00:' + String(Math.floor(k * 12)).padStart(2, '0');
  }

  function tick(now) {
    const t = now - start;
    const n = Math.floor(t / LEN);
    if (n !== lastLoop) { lastLoop = n; loops++; nEl.textContent = String(loops).padStart(3, '0'); }
    frame(t);
    if (!document.hidden) requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !reduce) requestAnimationFrame(tick); });
  if (reduce) frame(LEN * 0.58);
  else requestAnimationFrame(tick);
})();
