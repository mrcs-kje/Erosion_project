/* Loop 012: twelve seconds of walking down a corridor toward a red eye
   that never gets closer. Then it starts again, and the loop count goes up.
   The eye is a link. It blinks and watches the pointer.
   The player has a crack in its frame. Press it (hold, or drag along it) and
   the crack widens until the player breaks in two and falls away, showing the
   page behind it. With reduced motion the corridor is one still frame and the
   player simply disappears when the crack is wide enough. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1100, H = 600, LEN = 12000, RINGS = 5;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const screen = $('loop-screen'), rings = $('loop-rings'), edges = $('loop-edges');
  const eye = $('loop-eye'), eyeClip = $('loop-eye-clip-path'), iris = $('loop-iris'), pupil = $('loop-pupil');
  const bar = $('loop-bar'), time = $('loop-time'), nEl = $('loop-n');
  const ringEls = [], edgeEls = [];
  for (let i = 0; i < RINGS; i++) { const r = document.createElementNS(NS, 'rect'); rings.append(r); ringEls.push(r); }
  for (let i = 0; i < 6; i++) { const l = document.createElementNS(NS, 'line'); edges.append(l); edgeEls.push(l); }
  let loops = 12, start = performance.now(), lastLoop = 0;

  const box = (s) => ({ w: W * s, h: H * s, x: (W - W * s) / 2, y: (H - H * s) / 2 + H * s * 0.02 });
  function rect(el, b) { el.setAttribute('x', b.x.toFixed(1)); el.setAttribute('y', b.y.toFixed(1)); el.setAttribute('width', b.w.toFixed(1)); el.setAttribute('height', b.h.toFixed(1)); }
  function line(el, x1, y1, x2, y2) { el.setAttribute('x1', x1); el.setAttribute('y1', y1); el.setAttribute('x2', x2.toFixed(1)); el.setAttribute('y2', y2.toFixed(1)); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // The eye: where it looks (-1..1) and when it blinks next.
  let lookX = 0, lookY = 0, aimX = null, aimY = 0, blinkAt = 2500, blinkFrom = -1;
  screen.addEventListener('pointermove', (e) => {
    const m = screen.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    aimX = clamp((pt.x - W / 2) / 320, -1, 1);
    aimY = clamp((pt.y - H / 2) / 200, -1, 1);
  });
  screen.addEventListener('pointerleave', () => { aimX = null; });

  function drawEye(t, back) {
    let open = 1;
    if (!reduce) {
      if (blinkFrom < 0 && t > blinkAt) blinkFrom = t;
      if (blinkFrom >= 0) {
        const u = (t - blinkFrom) / 200;
        if (u >= 1) { blinkFrom = -1; blinkAt = t + 2500 + Math.random() * 4500; }
        else open = Math.max(0.04, 1 - Math.sin(u * Math.PI));
      }
      // Nobody pointing: it looks around slowly on its own.
      const tx = aimX === null ? Math.sin(t / 2300) * 0.6 : aimX;
      const ty = aimX === null ? Math.sin(t / 3100) * 0.3 : aimY;
      lookX += (tx - lookX) * 0.08; lookY += (ty - lookY) * 0.08;
    }
    const ew = back.w * 0.5, cx = W / 2, cy = back.y + back.h * 0.52, eh = ew * 0.36 * open;
    const d = 'M' + (cx - ew / 2).toFixed(1) + ',' + cy.toFixed(1)
      + ' Q' + cx.toFixed(1) + ',' + (cy - eh).toFixed(1) + ' ' + (cx + ew / 2).toFixed(1) + ',' + cy.toFixed(1)
      + ' Q' + cx.toFixed(1) + ',' + (cy + eh).toFixed(1) + ' ' + (cx - ew / 2).toFixed(1) + ',' + cy.toFixed(1) + ' Z';
    eye.setAttribute('d', d);
    eyeClip.setAttribute('d', d);
    const ir = ew * 0.17;
    const ix = cx + lookX * ir * 0.9, iy = cy + lookY * ir * 0.35;
    iris.setAttribute('cx', ix.toFixed(1)); iris.setAttribute('cy', iy.toFixed(1)); iris.setAttribute('r', ir.toFixed(1));
    pupil.setAttribute('cx', (ix + lookX * ir * 0.2).toFixed(1)); pupil.setAttribute('cy', (iy + lookY * ir * 0.1).toFixed(1));
    pupil.setAttribute('r', (ir * 0.42).toFixed(1));
  }

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
    drawEye(t, back);
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

  /* ---- the crack ---- */
  const player = $('loop-player'), crack = $('loop-crack'), grip = $('loop-crack-grip');
  const edgeLine = $('loop-crack-edge'), gapLine = $('loop-crack-gap'), hitLine = $('loop-crack-hit');
  const reopen = $('loop-reopen'), secret = document.querySelector('.loop-secret');
  const behind = document.querySelector('.loop-behind');
  let pts = [], lens = [], total = 0, p = 0, holding = false, lastX = 0, lastY = 0, last = 0, broken = false;

  // A new crack each time: from a spot on the top edge, jagged, down to the bottom.
  function newCrack() {
    let x = 660 + Math.random() * 120, y = 0;
    pts = [[x, 0]];
    while (y < 1000) {
      y = Math.min(1000, y + 40 + Math.random() * 60);
      x = clamp(x + (Math.random() - 0.5) * 90, 520, 900);
      pts.push([x, y]);
    }
    lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    total = lens[lens.length - 1];
    grip.style.left = (pts[0][0] / 10) + '%';
    p = 0;
    drawCrack();
  }

  // The visible part of the crack: its first (4% + 96% of p) of the length.
  function drawCrack() {
    const L = total * (0.04 + 0.96 * Math.min(1, p));
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (lens[i] <= L) { out.push(pts[i]); continue; }
      const f = (L - lens[i - 1]) / (lens[i] - lens[i - 1]);
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]);
      break;
    }
    const s = out.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
    [edgeLine, gapLine, hitLine].forEach((el) => el.setAttribute('points', s));
    const gap = 1 + p * 13;
    gapLine.style.strokeWidth = gap + 'px';
    edgeLine.style.strokeWidth = (gap + 2) + 'px';
  }

  function widen(by) {
    if (broken) return;
    p = Math.min(1, p + by);
    drawCrack();
    if (p >= 1) shatter();
  }

  function crackTick(now) {
    if (!holding || broken) { player.style.translate = ''; return; }
    widen((now - last) / 1000 * 0.33);
    last = now;
    if (!reduce) player.style.translate = ((Math.random() - 0.5) * 2 * p).toFixed(1) + 'px ' + ((Math.random() - 0.5) * 2 * p).toFixed(1) + 'px';
    requestAnimationFrame(crackTick);
  }

  function press(e) {
    if (broken) return;
    e.preventDefault();
    holding = true; lastX = e.clientX; lastY = e.clientY; last = performance.now();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* fine without capture */ }
    requestAnimationFrame(crackTick);
  }
  function drag(e) {
    if (!holding) return;
    widen(Math.hypot(e.clientX - lastX, e.clientY - lastY) * 0.0012);
    lastX = e.clientX; lastY = e.clientY;
  }
  function letGo() { holding = false; }
  [grip, hitLine].forEach((el) => {
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointermove', drag);
    el.addEventListener('pointerup', letGo);
    el.addEventListener('pointercancel', letGo);
  });
  // Keyboard: each Enter or Space widens it a step. (Pointer clicks have detail > 0.)
  grip.addEventListener('click', (e) => { if (e.detail === 0) widen(0.2); });

  function reveal(keyed) {
    player.hidden = true;
    player.style.clipPath = '';
    player.style.translate = '';
    document.body.classList.add('loop-revealed');
    behind.removeAttribute('aria-hidden');
    reopen.removeAttribute('tabindex');
    secret.removeAttribute('tabindex');
    if (keyed) reopen.focus({ preventScroll: true });
  }

  // The player breaks in two along the crack and both halves fall away.
  function shatter() {
    broken = true; holding = false;
    player.style.translate = '';
    const keyed = document.activeElement === grip;
    if (reduce) { reveal(keyed); return; }
    const along = pts.map((q) => (q[0] / 10).toFixed(2) + '% ' + (q[1] / 10).toFixed(2) + '%').join(', ');
    const half = player.cloneNode(true);
    half.removeAttribute('id');
    half.removeAttribute('role');
    half.setAttribute('aria-hidden', 'true');
    half.querySelectorAll('.loop-crack, .loop-crack-grip').forEach((el) => el.remove());
    crack.style.visibility = 'hidden';
    grip.style.visibility = 'hidden';
    player.style.clipPath = 'polygon(0% 0%, ' + along + ', 0% 100%)';
    half.style.clipPath = 'polygon(' + along + ', 100% 100%, 100% 0%)';
    player.after(half);
    const opts = { duration: 1100, easing: 'cubic-bezier(.5, 0, .9, .6)', fill: 'forwards' };
    const a = player.animate([
      { transform: 'translateX(-50%)', opacity: 1 },
      { transform: 'translateX(calc(-50% - 140px)) translateY(220px) rotate(-7deg)', opacity: 0 }], opts);
    half.animate([
      { transform: 'translateX(-50%)', opacity: 1 },
      { transform: 'translateX(calc(-50% + 160px)) translateY(260px) rotate(9deg)', opacity: 0 }], opts);
    a.onfinish = () => { half.remove(); player.getAnimations().forEach((x) => x.cancel()); reveal(keyed); };
  }

  // Once it is open, the old label behind it can bring the player back, with a new crack.
  reopen.addEventListener('click', () => {
    if (!broken || !player.hidden) return;
    broken = false;
    document.body.classList.remove('loop-revealed');
    behind.setAttribute('aria-hidden', 'true');
    reopen.setAttribute('tabindex', '-1');
    secret.setAttribute('tabindex', '-1');
    crack.style.visibility = '';
    grip.style.visibility = '';
    newCrack();
    player.hidden = false;
    if (!reduce) player.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'steps(3, end)' });
    grip.focus({ preventScroll: true });
  });

  newCrack();
})();
