/*
  EROSION.EXE crawler demo: crawl_33 (ribs), crawl_38 (octobrace), crawl_39 (feather).

  How to read this file
  - Everything is drawn on a <canvas> with only lines, dots and characters.
  - Each creature is ONE function. It is called every frame with the time `t`,
    the pointer `ptr` (or null) and a disturbance value `k` (0 = calm, 1 = just tapped).
  - Limbs are "tendrils": a chain of points where the direction turns a little
    at each step. The function `cf(t)` says how much the limb bends along its length.
    Changing `cf` over time is what makes the limbs move.
  - The numbers marked DIAL are safe to change.
*/
(() => {
  'use strict';

  const O = '#e8441b';      // the orange line colour
  const BG = '#090909';
  const FONT = '"DejaVu Sans Mono","SF Mono",Menlo,Consolas,monospace';
  const BRACKETS = [['(', ')'], ['{', '}'], ['[', ']'], ['<', '>']];
  const TAU = Math.PI * 2;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Each creature is designed in a 240 x 274 box and scaled to fit its canvas.
  const DESIGN_W = 240, DESIGN_H = 274;

  // ---- drawing helpers ------------------------------------------------------

  // A limb: starts at (x, y) pointing at angle a, turns by cf(t) along its length.
  function tendril(x, y, a, len, cf, steps = 40) {
    const P = [[x, y, a]];
    let g = a;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      g += cf(t) / steps;
      x += Math.cos(g) * len / steps;
      y += Math.sin(g) * len / steps;
      P.push([x, y, g]);
    }
    return P;
  }

  function stroke(ctx, P, w, alpha) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function dot(ctx, x, y, r, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function glyph(ctx, ch, x, y, size, rot, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = size + 'px ' + FONT;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }

  // Write characters along a limb, shrinking and fading toward the tip.
  function chars(ctx, P, str, s0, s1, alpha = 1) {
    let L = 0;
    const C = [0];
    for (let i = 1; i < P.length; i++) {
      L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      C.push(L);
    }
    let i = 1, d = 5, k = 0;
    while (d < L) {
      while (i < P.length - 1 && C[i] < d) i++;
      const seg = C[i] - C[i - 1] || 1;
      const t = (d - C[i - 1]) / seg;
      const x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t;
      const y = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t;
      const ang = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]);
      const u = d / L;
      const sz = s0 + (s1 - s0) * u;
      glyph(ctx, str[k % str.length], x, y, sz, ang, alpha * (1 - u * 0.5));
      d += sz * 0.7 + 1;
      k++;
    }
  }

  // One vertebra: a pair of brackets with a dot between them.
  function vertebra(ctx, x, y, i, half, size, alpha = 1) {
    glyph(ctx, BRACKETS[i % 4][0], x - half, y, size, 0, alpha);
    glyph(ctx, BRACKETS[i % 4][1], x + half, y, size, 0, alpha);
    dot(ctx, x, y, Math.max(1, size / 11), alpha);
  }

  // Turn a limb's starting direction toward the pointer when the pointer is near.
  function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  }
  function aimed(a, x, y, ptr, strength) {
    if (!ptr) return a;
    const dx = ptr.x - x, dy = ptr.y - y;
    const near = Math.exp(-Math.hypot(dx, dy) / 110) * strength; // DIAL: 110 = reach in px
    return a + angleDiff(a, Math.atan2(dy, dx)) * near;
  }

  // ---- crawl_33: ribs ---------------------------------------------------------
  // Ten vertebrae, each with a curling tendril on both sides.
  // A wave of motion runs down the spine, and a tap makes every rib curl tighter.
  function ribs(ctx, t, ptr, k) {
    for (let i = 0; i < 10; i++) {
      const y = 48 + i * 20;
      const x = 120 + Math.sin(t * 0.6 + i * 0.25) * 3;          // the spine sways
      const wave = Math.sin(t * 1.6 - i * 0.55);                  // DIAL: 1.6 speed, 0.55 wave spacing
      const len = (18 + Math.sin((i + 0.5) / 10 * Math.PI) * 50 * (1 - i * 0.045)) * (1 + 0.1 * wave);
      const curl = 1 + 0.2 * wave + 0.9 * k;                      // k = extra curl after a tap
      const alpha = 0.9 - i * 0.03;
      vertebra(ctx, x, y, i, 11, 21 - i * 0.5, 1 - i * 0.05);
      for (const sg of [1, -1]) {
        const sx = x + sg * 17;
        const a0 = aimed(sg > 0 ? 0 : Math.PI, sx, y, ptr, 0.5);
        const P = tendril(sx, y, a0, len, (tt) => sg * (2.4 + 7 * tt * tt * tt) * curl);
        stroke(ctx, P, 1.1, alpha);
        dot(ctx, P[P.length - 1][0], P[P.length - 1][1], 1.6, alpha);
      }
    }
  }

  // ---- crawl_38: octobrace ----------------------------------------------------
  // Eight arms written in bracket characters, growing from one point.
  // A tap makes the arms splay outward and ripple harder.
  function octobrace(ctx, t, ptr, k) {
    const hy = 62 + Math.sin(t * 1.2) * 3;   // where the arms start (the body and head are gone)
    const text = '()(){}()[]';
    const base = [22, 44, 64, 82, 98, 116, 136, 158];             // arm angles, degrees (90 = straight down)
    for (let a = 0; a < 8; a++) {
      const deg = 90 + (base[a] - 90) * (1 + 0.45 * k);           // splay on tap
      const ang = deg * Math.PI / 180;
      const sg = a < 4 ? 1 : -1;
      const len = (84 + 42 * Math.sin(base[a] * Math.PI / 180)) * (1 + 0.1 * Math.sin(t * 1.4 + a));
      const x0 = 120, y0 = hy + 36;
      const a1 = aimed(ang, x0, y0, ptr, 0.6);
      const P = tendril(x0, y0, a1, len,
        (tt) => sg * (0.5 + 1.3 * tt * tt) + Math.sin(tt * 5 + a + t * 2.2) * (0.35 + 0.3 * k));
      chars(ctx, P, text.slice(a % 4) + text, 19, 9);
      dot(ctx, P[P.length - 1][0], P[P.length - 1][1], 1.8);
    }
  }

  // ---- crawl_39: feather ------------------------------------------------------
  // A slim spine with dense barbs that flutter in a wave and a tail that curls and uncurls. A tap fans the barbs open.
  function feather(ctx, t, ptr, k) {
    const sway = (y) => 4 * Math.sin(t * 0.9 - y / 50);
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let y = 240; y >= 52; y -= 4) {
      const x = 120 + 6 * Math.sin(y / 30) + sway(y);
      if (y === 240) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    for (let i = 0; i < 12; i++) {
      const y = 64 + i * 14;
      const x = 120 + 6 * Math.sin(y / 30) + sway(y);
      const len = 18 + Math.sin(i / 11 * Math.PI) * 34;
      vertebra(ctx, x, y, i, 6, 13, 1 - i * 0.04);
      const flutter = Math.sin(t * 3 - i * 0.6) * 0.16 + k * 0.35; // DIAL: 3 = flutter speed
      for (const sg of [-1, 1]) {
        for (const ph of [0, 1]) {
          const base = (sg > 0 ? 40 + ph * 22 : 140 - ph * 22) * Math.PI / 180;
          const P = tendril(x + sg * 8, y, base - sg * flutter, len * (ph ? 0.7 : 1), (tt) => -sg * 0.5 * tt, 12);
          stroke(ctx, P, 0.9, 0.85);
          dot(ctx, P[12][0], P[12][1], 1.4);
        }
      }
    }

    const tail = tendril(120 + sway(240), 240, 1.5, 34, (tt) => -(3 + 10 * tt * tt) * (0.75 + 0.25 * Math.sin(t * 1.7)));
    stroke(ctx, tail, 1.3, 0.9);
  }

  // ---- stage: one canvas per creature ------------------------------------------
  const stages = [
    { id: 'c33', draw: ribs },
    { id: 'c38', draw: octobrace },
    { id: 'c39', draw: feather }
  ].map((s) => {
    const canvas = document.getElementById(s.id);
    const st = { canvas, ctx: canvas.getContext('2d'), draw: s.draw, ptr: null, k: 0, visible: true, w: 0, h: 0, dpr: 1, sc: 1, ox: 0, oy: 0 };
    return st;
  });

  function size(st) {
    const r = st.canvas.getBoundingClientRect();
    st.dpr = Math.min(window.devicePixelRatio || 1, 2);
    st.w = r.width;
    st.h = r.height;
    st.canvas.width = Math.round(r.width * st.dpr);
    st.canvas.height = Math.round(r.height * st.dpr);
    st.sc = Math.min(st.w / DESIGN_W, st.h / DESIGN_H);
    st.ox = (st.w - DESIGN_W * st.sc) / 2;
    st.oy = (st.h - DESIGN_H * st.sc) / 2;
  }

  function render(st, t) {
    const ctx = st.ctx;
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, st.w, st.h);
    ctx.translate(st.ox, st.oy);
    ctx.scale(st.sc, st.sc);
    ctx.fillStyle = O;
    ctx.strokeStyle = O;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    st.draw(ctx, t, st.ptr, st.k);
  }

  stages.forEach((st) => {
    new ResizeObserver(() => { size(st); render(st, performance.now() / 1000); }).observe(st.canvas);
    new IntersectionObserver((e) => { st.visible = e[0].isIntersecting; }).observe(st.canvas);

    const toDesign = (e) => {
      const r = st.canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left - st.ox) / st.sc, y: (e.clientY - r.top - st.oy) / st.sc };
    };
    st.canvas.addEventListener('pointermove', (e) => { st.ptr = toDesign(e); });
    st.canvas.addEventListener('pointerdown', (e) => { st.ptr = toDesign(e); st.k = 1; });
    st.canvas.addEventListener('pointerleave', () => { st.ptr = null; });
    st.canvas.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') st.ptr = null; });
  });

  // ---- loop: only runs while the page is visible -------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    for (const st of stages) {
      if (!st.visible) continue;
      st.k = Math.max(0, st.k - dt * 0.8);      // DIAL: 0.8 = how fast a tap fades
      render(st, now / 1000);
    }
    if (!document.hidden) requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { last = performance.now(); requestAnimationFrame(frame); }
  });

  if (reduceMotion) {
    stages.forEach((st) => { size(st); render(st, 0.8); });   // one still frame, no animation
  } else {
    requestAnimationFrame(frame);
  }
})();
