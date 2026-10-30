/*
  Erosion.exe: DRAWINGS / DUMP 02, an endless sheet of paper.

  - The sheet wraps around (a torus): drag, scroll or use the arrow keys and
    it never ends. Everything is placed at random on every visit, in a new
    order, and a drawing that comes back around the edge is often redrawn
    (a new seed), so new things keep turning up.
  - Most drawings are made here, from a seed: contour maps, flow fields,
    hatched objects, growth, a specimen, a wireframe head, a map of the
    rooms. Some draw themselves, erode or glitch while you look.
  - Drawings by Marcus, collaborators and found things come from
    drawings.js (window.SK_DRAWINGS), images in sketch/drawings/.
  - #world stays the size of the window, so the creatures stay with you:
    they ride along with the paper and get pushed in at the edges.
  Load BEFORE nav.js, words.js, creatures.js and page.js, so the drawings
  exist when those scripts look for links and words.
*/
(() => {
  'use strict';

  const world = document.getElementById('world');
  const sheet = world && world.querySelector('.sk-sheet');
  if (!sheet) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const NS = 'http://www.w3.org/2000/svg';

  // ---- Randomness ----------------------------------------------------------
  function mulberry(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const seed = () => (Math.random() * 2 ** 32) >>> 0;
  const rand = mulberry(seed());
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const shuffle = (r, arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  // Smooth value noise, one field per seed.
  function noise(r) {
    const p = new Uint8Array(512), v = new Float32Array(256);
    for (let i = 0; i < 256; i++) { p[i] = i; v[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 256; i++) p[i + 256] = p[i];
    const s = (t) => t * t * (3 - 2 * t);
    const at = (x, y) => v[p[p[x & 255] + (y & 255)]];
    const n = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
    return (x, y) => n(x, y) * 0.62 + n(x * 2.1 + 17, y * 2.1 + 5) * 0.28 + n(x * 4.3 + 3, y * 4.3 + 11) * 0.1;
  }

  // ---- Path helpers -------------------------------------------------------
  const f = (n) => Math.round(n * 10) / 10;
  const poly = (pts) => pts.length ? 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') : '';
  // A curve through the points (Catmull-Rom as cubic Beziers).
  function curve(pts, closed) {
    if (pts.length < 3) return poly(pts);
    const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
    let d = 'M' + f(P[1][0]) + ' ' + f(P[1][1]);
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    return d;
  }
  // A ruler line drawn by hand: a few slight bends.
  function hand(r, x1, y1, x2, y2, wob) {
    const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 40));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, e = i === 0 || i === n ? 0.3 : 1;
      pts.push([x1 + (x2 - x1) * t + (r() - 0.5) * wob * e, y1 + (y2 - y1) * t + (r() - 0.5) * wob * e]);
    }
    return curve(pts);
  }
  const path = (cls, d, extra) => d ? '<path class="' + cls + '" d="' + d + '"' + (extra || '') + '/>' : '';
  const text = (x, y, s, cls) => '<text class="' + (cls || 'sk-t') + '" x="' + f(x) + '" y="' + f(y) + '">' + s + '</text>';

  // ---- The drawings ----------------------------------------------------------
  // Each kind: w (width in px), vb (viewBox w, h), label, draw(r) -> svg markup.
  // reseed: may be redrawn when it comes back around the edge.
  // anim(el, r): returns { tick(now), stop() } for drawings that move.
  const KINDS = {};

  // A contour map of a place that is not there.
  KINDS.topo = {
    w: 440, vb: [420, 320], reseed: true, label: () => pick(rand, ['SURVEY OF A PLACE THAT MOVES', 'CONTOURS / NO NORTH', 'HIGH GROUND, LOW CONFIDENCE']),
    draw(r) {
      const n = noise(r), S = 7, cols = 61, rows = 46, sc = 0.012 + r() * 0.008;
      const bx = r() * 420, by = r() * 320;
      const F = [];
      for (let j = 0; j < rows; j++) {
        F.push([]);
        for (let i = 0; i < cols; i++) {
          const x = i * S, y = j * S;
          F[j].push(n(x * sc, y * sc) + 0.35 * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / 9000));
        }
      }
      let lo = Infinity, hi = -Infinity, top = [0, 0];
      F.forEach((row, j) => row.forEach((v, i) => { if (v < lo) lo = v; if (v > hi) { hi = v; top = [i * S, j * S]; } }));
      const levels = 13;
      let thin = '', thick = '';
      for (let k = 1; k < levels; k++) {
        const t = lo + (hi - lo) * k / levels;
        let d = '';
        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols - 1; i++) {
            const a = F[j][i], b = F[j][i + 1], c = F[j + 1][i + 1], e = F[j + 1][i];
            const pts = [];
            const edge = (v1, v2, x1, y1, x2, y2) => { if ((v1 < t) !== (v2 < t)) { const u = (t - v1) / (v2 - v1); pts.push([x1 + (x2 - x1) * u, y1 + (y2 - y1) * u]); } };
            const x = i * S, y = j * S;
            edge(a, b, x, y, x + S, y); edge(b, c, x + S, y, x + S, y + S);
            edge(e, c, x, y + S, x + S, y + S); edge(a, e, x, y, x, y + S);
            if (pts.length >= 2) d += poly(pts.slice(0, 2));
            if (pts.length === 4) d += poly(pts.slice(2, 4));
          }
        }
        if (k % 4 === 0) thick += d; else thin += d;
      }
      let ticks = '';
      for (let x = 0; x <= 420; x += 35) ticks += 'M' + x + ' -6L' + x + ' -1M' + x + ' 321L' + x + ' 326';
      const route = [];
      for (let i = 0; i < 6; i++) route.push([20 + i * 76 + (r() - 0.5) * 40, 40 + r() * 240]);
      return path('k', thin) + path('k k2', thick) + path('g', ticks) +
        path('r dash', curve(route)) + '<circle class="f" cx="' + f(top[0]) + '" cy="' + f(top[1]) + '" r="3.5"/>' +
        text(top[0] + 7, top[1] - 6, 'SUMMIT?') + text(2, 316, 'SHEET ' + Math.floor(r() * 90 + 10) + ' / 1:?');
    }
  };

  // A flow field: wind, held still.
  KINDS.flow = {
    w: 400, vb: [400, 300], reseed: true, label: () => pick(rand, ['WIND, HELD STILL', 'WHERE THE PAPER WANTS TO GO', 'CURRENT / LOGGED BY HAND']),
    draw(r) {
      const n = noise(r), sc = 0.006 + r() * 0.006, turn = 3 + r() * 5;
      let d = '', red = '';
      for (let k = 0; k < 190; k++) {
        let x = r() * 400, y = r() * 300;
        const pts = [[x, y]];
        for (let s = 0; s < 26; s++) {
          const a = n(x * sc, y * sc) * Math.PI * turn;
          x += Math.cos(a) * 3.2; y += Math.sin(a) * 3.2;
          if (x < 0 || x > 400 || y < 0 || y > 300) break;
          pts.push([x, y]);
        }
        if (k === 0) red = poly(pts); else d += poly(pts);
      }
      return path('k thin', d) + path('r k2', red);
    }
  };

  // A hatched sphere and its shadow.
  KINDS.sphere = {
    w: 300, vb: [300, 300], reseed: true, label: () => pick(rand, ['OBJECT STUDY / LIGHT FROM NOWHERE', 'ROUND THING, SHADED', 'STILL LIFE WITHOUT LIFE']),
    draw(r) {
      const cx = 150, cy = 132, R = 96;
      const la = r() * Math.PI * 2, L = [Math.cos(la) * 0.7, Math.sin(la) * 0.7 - 0.2, 0.6];
      const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
      const shade = (x, y) => {
        const nx = (x - cx) / R, ny = (y - cy) / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        return 1 - Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      };
      const layers = [[0.3, 0.6 + r() * 0.3], [0.55, -0.7 - r() * 0.3], [0.8, 0.05]];
      let d = '';
      for (const [th, ang] of layers) {
        const ca = Math.cos(ang), sa = Math.sin(ang);
        for (let o = -R; o <= R; o += 4.2) {
          let run = null;
          for (let s = -R; s <= R; s += 2) {
            const x = cx + ca * s - sa * o, y = cy + sa * s + ca * o;
            const inside = (x - cx) ** 2 + (y - cy) ** 2 < R * R;
            if (inside && shade(x, y) > th + (r() - 0.5) * 0.05) { if (!run) run = [[x, y]]; else run[1] = [x, y]; }
            else if (run) { if (run[1]) d += poly(run); run = null; }
          }
          if (run && run[1]) d += poly(run);
        }
      }
      // the cast shadow, away from the light
      const sx = cx - L[0] * 70, sy = 262;
      let sh = '';
      for (let y = sy - 16; y <= sy + 16; y += 3.4) {
        const half = 92 * Math.sqrt(Math.max(0, 1 - ((y - sy) / 17) ** 2));
        if (half > 4) sh += 'M' + f(sx - half) + ' ' + f(y) + 'L' + f(sx + half) + ' ' + f(y);
      }
      const rim = [];
      for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; rim.push([cx + Math.cos(a) * (R + (r() - 0.5) * 2.4), cy + Math.sin(a) * (R + (r() - 0.5) * 2.4)]); }
      return path('g', sh) + path('k', d) + path('k k2', curve(rim, true)) + path('g', hand(r, 10, 278, 290, 276, 3));
    }
  };

  // Growth: a tree that nobody supervised.
  KINDS.tree = {
    w: 320, vb: [320, 360], reseed: true, label: () => pick(rand, ['GROWTH / UNSUPERVISED', 'IT WAS SMALLER YESTERDAY', 'BRANCHING, NO REASON GIVEN']),
    draw(r) {
      let d = '', leaves = '', fruit = null;
      const spread = 0.3 + r() * 0.35, shrink = 0.7 + r() * 0.08;
      const grow = (x, y, a, len, depth) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        const bend = (r() - 0.5) * len * 0.25;
        d += 'M' + f(x) + ' ' + f(y) + 'Q' + f((x + x2) / 2 + Math.cos(a + 1.57) * bend) + ' ' + f((y + y2) / 2 + Math.sin(a + 1.57) * bend) + ' ' + f(x2) + ' ' + f(y2);
        if (depth === 0 || len < 4) {
          if (r() < 0.5) leaves += '<circle class="k" cx="' + f(x2) + '" cy="' + f(y2) + '" r="' + f(1.5 + r() * 2.5) + '"/>';
          if (!fruit && r() < 0.03) fruit = [x2, y2];
          return;
        }
        const kids = r() < 0.25 ? 3 : 2;
        for (let i = 0; i < kids; i++) grow(x2, y2, a + (i - (kids - 1) / 2) * spread * 2 + (r() - 0.5) * 0.4, len * shrink * (0.85 + r() * 0.3), depth - 1);
      };
      grow(160, 340, -Math.PI / 2 + (r() - 0.5) * 0.2, 70 + r() * 15, 8);
      let roots = '';
      for (let i = 0; i < 6; i++) roots += hand(r, 160, 340, 160 + (r() - 0.5) * 140, 350 + r() * 8, 6);
      return path('k', d) + leaves + path('g', roots) + (fruit ? '<circle class="f" cx="' + f(fruit[0]) + '" cy="' + f(fruit[1]) + '" r="5"/>' : '');
    }
  };

  // A specimen, numbered, with notes that do not help.
  KINDS.specimen = {
    w: 470, vb: [460, 300], reseed: true, href: '../archive/index.html', aria: 'Specimen drawing: go to the archive',
    label: () => pick(rand, ['SPECIMEN, UNCLASSIFIED', 'FOUND UNDER THE ARCHIVE', 'FIG. ? / DO NOT TOUCH']),
    draw(r) {
      const spine = [];
      const amp = 20 + r() * 30, ph = r() * 6;
      for (let i = 0; i < 9; i++) spine.push([60 + i * 40, 150 + Math.sin(ph + i * 0.9) * amp]);
      let body = '', legs = '', dots = '';
      const pts = [];
      for (let i = 0; i < spine.length - 1; i++) for (let t = 0; t < 1; t += 0.25) pts.push([spine[i][0] + (spine[i + 1][0] - spine[i][0]) * t, spine[i][1] + (spine[i + 1][1] - spine[i][1]) * t]);
      pts.forEach((p, i) => {
        const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        const a = Math.atan2(q[1] - o[1], q[0] - o[0]) + Math.PI / 2;
        const w = 22 * Math.sin(Math.PI * (i + 2) / (pts.length + 3)) + 3;
        body += 'M' + f(p[0] + Math.cos(a) * w) + ' ' + f(p[1] + Math.sin(a) * w) + 'L' + f(p[0] - Math.cos(a) * w) + ' ' + f(p[1] - Math.sin(a) * w);
        if (i % 3 === 1) {
          for (const side of [1, -1]) {
            const kx = p[0] + Math.cos(a) * side * (w + 18) + (r() - 0.5) * 10, ky = p[1] + Math.sin(a) * side * (w + 18);
            legs += poly([[p[0] + Math.cos(a) * side * w, p[1] + Math.sin(a) * side * w], [kx, ky], [kx + 14 * (r() - 0.3), ky + side * 22]]);
          }
        }
      });
      const head = spine[spine.length - 1];
      const ring = [];
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ring.push([head[0] + 14 + Math.cos(a) * (18 + r() * 4), head[1] + Math.sin(a) * (15 + r() * 4)]); }
      dots += '<circle class="d" cx="' + f(head[0] + 20) + '" cy="' + f(head[1] - 4) + '" r="2.4"/><circle class="f" cx="' + f(head[0] + 12) + '" cy="' + f(head[1] + 3) + '" r="2"/>';
      const names = shuffle(r, ['MOUTH', 'FALSE EYE', 'SPARE LEG', 'WORD SAC', 'DOOR (SHUT)', 'WHERE IT HURTS', 'INTAKE', 'SPINE 2 OF 3', 'UNKNOWN', 'THE SOFT PART']).slice(0, 5);
      let leads = '', notes = '';
      names.forEach((nm, i) => {
        const p = pts[Math.floor((i + 0.5) / 5 * pts.length)], up = i % 2 === 0;
        const lx = 30 + i * 88, ly = up ? 30 : 280;
        leads += hand(r, p[0], p[1], lx + 10, up ? ly + 6 : ly - 12, 4);
        notes += text(lx, ly, String(i + 1).padStart(2, '0') + ' ' + nm);
      });
      return path('g', leads) + path('k', curve(spine)) + path('k', body) + path('k', legs) + path('k k2', curve(ring, true)) + dots + notes;
    }
  };

  // Isometric blocks: room 3, from above.
  KINDS.blocks = {
    w: 360, vb: [360, 330], reseed: true, href: '../room/index.html', aria: 'Isometric blocks: go to room 3',
    label: () => pick(rand, ['ROOM 3, FROM ABOVE', 'FLOOR PLAN, STACKED', 'THE STAIRS ARE IN HERE SOMEWHERE']),
    draw(r) {
      const N = 5, s = 22, ox = 180, oy = 120;
      const H = [];
      for (let i = 0; i < N; i++) { H.push([]); for (let j = 0; j < N; j++) H[i].push(r() < 0.18 ? 0 : 1 + Math.floor(r() * (1 + i + j) * 0.7)); }
      const iso = (x, y, z) => [ox + (x - y) * s, oy + (x + y) * s * 0.5 - z * s];
      let d = '', hatch = '', dense = '', red = '';
      const redAt = [Math.floor(r() * N), Math.floor(r() * N)];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const h = H[i][j];
        if (!h) continue;
        const A = iso(i, j, h), B = iso(i + 1, j, h), C = iso(i + 1, j + 1, h), D = iso(i, j + 1, h);
        const B0 = iso(i + 1, j, 0), C0 = iso(i + 1, j + 1, 0), D0 = iso(i, j + 1, 0);
        const top = poly([A, B, C, D, A]);
        // left face (D C C0 D0), light hatching; right face (B C C0 B0), dense
        d += top + poly([D, D0, C0, C, B, B0, C0]);
        for (let t = 0.2; t < 1; t += 0.2) hatch += poly([[D[0] + (C[0] - D[0]) * t, D[1] + (C[1] - D[1]) * t], [D0[0] + (C0[0] - D0[0]) * t, D0[1] + (C0[1] - D0[1]) * t]]);
        for (let z = 0.25; z < h; z += 0.25) { const P = iso(i + 1, j, z), Q = iso(i + 1, j + 1, z); dense += poly([P, Q]); }
        if (i === redAt[0] && j === redAt[1]) red = top;
      }
      return path('g', hatch) + path('k thin', dense) + path('k', d) + path('r k2', red) + text(4, 322, 'H = ' + H.flat().reduce((a, b) => a + b, 0) + ' UNITS');
    }
  };

  // A head made of a lattice, turned a little.
  KINDS.head = {
    w: 290, vb: [300, 340], reseed: true, label: () => pick(rand, ['PORTRAIT / NOBODY SAT FOR IT', 'HEAD, ROTATED WITHOUT PERMISSION', 'SELF PORTRAIT (NOT MINE)']),
    draw(r) {
      const n = noise(r), rot = (r() - 0.5) * 1.4, tilt = (r() - 0.5) * 0.3;
      const P = (u, v) => {
        // u: around (0..2pi), v: top to bottom (0..pi)
        const jaw = v > 1.9 ? 1 - (v - 1.9) * 0.42 : 1;
        const rad = 100 * (0.92 + n(u * 1.3, v * 1.3) * 0.18) * jaw;
        let x = Math.sin(v) * Math.cos(u) * rad * 0.82, y = -Math.cos(v) * rad / jaw * 1.12, z = Math.sin(v) * Math.sin(u) * rad;
        if (Math.abs(u - Math.PI / 2) < 0.3 && v > 1.45 && v < 1.95) z += 22 * Math.cos((u - Math.PI / 2) / 0.3 * 1.57) * Math.sin((v - 1.45) / 0.5 * Math.PI);
        const x2 = x * Math.cos(rot) - z * Math.sin(rot), z2 = x * Math.sin(rot) + z * Math.cos(rot);
        const y2 = y * Math.cos(tilt) - z2 * Math.sin(tilt), z3 = y * Math.sin(tilt) + z2 * Math.cos(tilt);
        return [150 + x2, 160 + y2, z3];
      };
      let front = '', back = '';
      const line = (fn, steps) => {
        let run = [], side = null;
        for (let k = 0; k <= steps; k++) {
          const p = fn(k / steps), s = p[2] > -4;
          if (side !== null && s !== side) { if (side) front += poly(run); else back += poly(run); run = [run[run.length - 1]]; }
          side = s; run.push(p);
        }
        if (side) front += poly(run); else back += poly(run);
      };
      for (let i = 1; i < 14; i++) { const v = i / 14 * Math.PI; line((t) => P(t * Math.PI * 2, v), 60); }
      for (let i = 0; i < 20; i++) { const u = i / 20 * Math.PI * 2; line((t) => P(u, 0.05 + t * (Math.PI - 0.1)), 40); }
      const eye = P(Math.PI / 2 - 0.42 + rot * 0, 1.35), eye2 = P(Math.PI / 2 + 0.42, 1.35);
      let neck = '';
      for (const s of [-1, 1]) neck += hand(r, 150 + s * 26, 252, 150 + s * 34, 336, 4);
      return path('g', back) + path('k', front) + path('k', neck) +
        (eye[2] > 0 ? '<circle class="f" cx="' + f(eye[0]) + '" cy="' + f(eye[1]) + '" r="3.5"/>' : '') +
        (eye2[2] > 0 ? '<circle class="d" cx="' + f(eye2[0]) + '" cy="' + f(eye2[1]) + '" r="2.5"/>' : '');
    }
  };

  // Two sets of rings that disagree.
  KINDS.moire = {
    w: 260, vb: [300, 300], reseed: true, label: () => pick(rand, ['INTERFERENCE', 'TWO CENTRES, NO AGREEMENT', 'DO NOT STARE AT THIS']),
    draw(r) {
      let d = '';
      const dx = 10 + r() * 30, dy = (r() - 0.5) * 30, gap = 4 + r() * 2;
      for (let k = 0; k < 2; k++) {
        const cx = 150 + (k ? dx : -dx) / 2, cy = 150 + (k ? dy : -dy) / 2;
        for (let rr = gap; rr < 128; rr += gap) d += '<circle class="k thin" cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(rr) + '"/>';
      }
      return d + '<circle class="f" cx="150" cy="150" r="3"/>';
    }
  };

  // A letter, eroding in 24 steps.
  const LETTERS = {
    E: [[[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0.5], [0.8, 0.5]], [[0, 1], [1, 1]]],
    R: [[[0, 1], [0, 0], [0.8, 0], [1, 0.2], [0.8, 0.5], [0, 0.5]], [[0.4, 0.5], [1, 1]]],
    S: [[[1, 0.05], [0.2, 0], [0, 0.25], [1, 0.75], [0.8, 1], [0, 0.95]]],
    O: [[[0.5, 0], [1, 0.3], [1, 0.7], [0.5, 1], [0, 0.7], [0, 0.3], [0.5, 0]]],
    X: [[[0, 0], [1, 1]], [[1, 0], [0, 1]]]
  };
  KINDS.letters = {
    w: 420, vb: [420, 300], reseed: true, label: () => pick(rand, ['ONE LETTER, ERODING, 24 STEPS', 'TYPE SPECIMEN / FAILING', 'IT USED TO SAY SOMETHING']),
    draw(r) {
      const ch = pick(r, Object.keys(LETTERS));
      const segs = [];
      LETTERS[ch].forEach((strokeLine) => {
        for (let i = 0; i < strokeLine.length - 1; i++) for (let t = 0; t < 1; t += 0.125) {
          const a = strokeLine[i], b = strokeLine[i + 1];
          segs.push([[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [a[0] + (b[0] - a[0]) * (t + 0.125), a[1] + (b[1] - a[1]) * (t + 0.125)]]);
        }
      });
      const order = shuffle(r, segs.map((_, i) => i));
      let d = '', nums = '';
      for (let k = 0; k < 24; k++) {
        const cx = 14 + (k % 6) * 68, cy = 14 + Math.floor(k / 6) * 72, keep = 1 - k / 23, jit = k * 0.35;
        order.forEach((si, rank) => {
          if (rank / order.length >= keep) return;
          const [a, b] = segs[si];
          d += poly([[cx + a[0] * 34 + (r() - 0.5) * jit, cy + a[1] * 46 + (r() - 0.5) * jit], [cx + b[0] * 34 + (r() - 0.5) * jit, cy + b[1] * 46 + (r() - 0.5) * jit]]);
        });
        nums += text(cx, cy + 58, String(k + 1).padStart(2, '0'), 'sk-t sk-tg');
      }
      return path('k k2', d) + nums + '<circle class="f" cx="' + (14 + 5 * 68 + 17) + '" cy="' + (14 + 3 * 72 + 23) + '" r="3"/>';
    }
  };

  // A map of the rooms. The boxes are real links (HTML, laid over the drawing).
  const ROOMS = [
    ['EROSION.EXE', '../index.html'], ['ARCHIVE', '../archive/index.html'], ['ROOM 3', '../room/index.html'],
    ['LOOP 012', '../loop/index.html'], ['THE DOOR', '../game/index.html'], ['REPAIRING A MEMORY', '../raw/index.html'],
    ['PIECE 07', '../random/index.html'], ['YOU ARE HERE', null], ['?', null]
  ];
  KINDS.map = {
    w: 470, vb: [460, 340], label: () => 'MAP, PROBABLY WRONG', links: true,
    draw(r) {
      // three columns, three rows, shuffled; a box is at most 140 wide
      const spots = shuffle(r, [[8, 24], [160, 14], [312, 34], [14, 150], [166, 140], [306, 160], [8, 274], [160, 290], [312, 280]]);
      const nodes = ROOMS.map((room, i) => ({ room, x: spots[i][0] + (r() - 0.5) * 12, y: spots[i][1] + (r() - 0.5) * 16 }));
      let d = '', g = '', boxes = '';
      nodes.forEach((a, i) => {
        const b = nodes[(i + 1 + Math.floor(r() * 3)) % nodes.length];
        const line = hand(r, a.x + 40, a.y + 12, b.x + 40, b.y + 12, 18);
        if (r() < 0.35) g += line; else d += line;
      });
      nodes.forEach((nd) => {
        const w = nd.room[0].length * 7 + 14, h = 24;
        const cls = nd.room[0] === 'YOU ARE HERE' ? 'r k2' : 'k';
        boxes += path(cls, poly([[nd.x, nd.y], [nd.x + w, nd.y + (r() - 0.5) * 3], [nd.x + w + (r() - 0.5) * 3, nd.y + h], [nd.x, nd.y + h + (r() - 0.5) * 3], [nd.x, nd.y]]));
        nd.w = w; nd.h = h;
      });
      this.nodes = nodes;
      return path('g dash', g) + path('k thin', d) + '<g class="sk-paper">' + boxes + '</g>';
    },
    // the HTML links on top of the boxes (positions in % of the drawing)
    overlay(nodes) {
      return nodes.map((nd) => {
        const st = 'left:' + f(nd.x / 460 * 100) + '%;top:' + f(nd.y / 340 * 100) + '%;width:' + f(nd.w / 460 * 100) + '%;height:' + f(nd.h / 340 * 100) + '%';
        if (!nd.room[1]) return '<span class="sk-node' + (nd.room[0] === '?' ? '' : ' sk-here') + '" style="' + st + '">' + nd.room[0] + '</span>';
        return '<a class="sk-node" style="' + st + '" href="' + nd.room[1] + '">' + nd.room[0] + '</a>';
      }).join('');
    }
  };

  // ---- Drawings that move ------------------------------------------------
  // A pen left running: one line that never stops, the old part fades.
  KINDS.plotter = {
    w: 330, vb: [320, 260], label: () => 'PEN LEFT RUNNING', live: true,
    draw: () => '<g class="sk-pen"></g><circle class="f sk-nib" r="3" cx="160" cy="130"/>',
    anim(el, r) {
      const g = el.querySelector('.sk-pen'), nib = el.querySelector('.sk-nib');
      const CH = 6, LEN = 140, paths = [];
      for (let i = 0; i < CH; i++) { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', 'k'); p.style.opacity = ((i + 1) / CH).toFixed(2); g.appendChild(p); paths.push(p); }
      const pts = [];
      let x = 160, y = 130, a = r() * 6.28, va = 0, last = 0;
      const step = () => {
        va += (r() - 0.5) * 0.12; va *= 0.94;
        const dx = 160 - x, dy = 130 - y, toward = Math.atan2(dy, dx), far = Math.hypot(dx, dy) / 120;
        let diff = toward - a; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        a += va + diff * 0.04 * far * far;
        x += Math.cos(a) * 2.2; y += Math.sin(a) * 2.2;
        pts.push([x, y]); if (pts.length > CH * LEN) pts.shift();
      };
      for (let i = 0; i < CH * LEN; i++) step();
      const draw = () => {
        for (let i = 0; i < CH; i++) paths[i].setAttribute('d', poly(pts.slice(i * LEN, (i + 1) * LEN + 1)));
        nib.setAttribute('cx', f(x)); nib.setAttribute('cy', f(y));
      };
      draw();
      return { tick(now) { if (now - last < 33) return; last = now; step(); step(); draw(); } };
    }
  };

  // One continuous line that draws a face, wipes it and tries again.
  KINDS.trying = {
    w: 280, vb: [300, 320], label: () => 'IT KEEPS TRYING', live: true,
    draw: () => '<circle class="g" cx="150" cy="150" r="112"/><path class="k k2 sk-try" pathLength="1"/>',
    anim(el, r) {
      const p = el.querySelector('.sk-try');
      const make = () => {
        const pts = [];
        // outline, eyes, nose, mouth, in one go, never lifting the pen
        for (let i = 0; i <= 14; i++) { const a = -1.2 + i / 14 * 6.2; pts.push([150 + Math.cos(a) * (78 + r() * 14), 160 + Math.sin(a) * (100 + r() * 12)]); }
        pts.push([118 + r() * 8, 128 + r() * 8], [104, 126 + r() * 6], [120, 120], [136, 126], [150, 128 + r() * 10]);
        pts.push([180 + r() * 6, 124], [196, 128 + r() * 6], [182, 134], [166, 128]);
        pts.push([152 + r() * 6, 170], [140, 186 + r() * 6], [156, 190]);
        pts.push([126, 214 + r() * 8], [150, 222 + r() * 10], [176, 212 + r() * 8], [150 + (r() - 0.5) * 60, 300]);
        p.setAttribute('d', curve(pts.map(([px, py]) => [px + (r() - 0.5) * 8, py + (r() - 0.5) * 8])));
      };
      make();
      const T = 9000;
      let t0 = null, round = 0;
      return {
        tick(now) {
          if (t0 === null) t0 = now;
          const t = (now - t0) / T;
          if (Math.floor(t) !== round) { round = Math.floor(t); make(); }
          const u = t - Math.floor(t);
          // draw (0 to 0.5), hold, then wipe from the start (0.75 to 1)
          const off = u < 0.5 ? 1 - u / 0.5 : u < 0.75 ? 0 : -(u - 0.75) / 0.25;
          p.style.strokeDasharray = '1 1';
          p.style.strokeDashoffset = off.toFixed(4);
        },
        still() { p.style.strokeDasharray = 'none'; }
      };
    }
  };

  // Something breathing under the paper.
  KINDS.breath = {
    w: 300, vb: [300, 220], label: () => 'SOMETHING UNDER THE PAPER', live: true,
    draw: () => '<g class="sk-lines"></g>',
    anim(el, r) {
      const g = el.querySelector('.sk-lines'), L = [];
      for (let i = 0; i < 20; i++) { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', 'k thin'); g.appendChild(p); L.push(p); }
      const bx = 90 + r() * 120, by = 70 + r() * 80;
      let last = 0;
      const draw = (now) => {
        const amp = 16 + Math.sin(now / 1400) * 12, cx = bx + Math.sin(now / 3100) * 20;
        L.forEach((p, i) => {
          const y0 = 12 + i * 10.5, pts = [];
          for (let x = 0; x <= 300; x += 10) pts.push([x, y0 - amp * Math.exp(-((x - cx) ** 2) / 1600 - ((y0 - by) ** 2) / 2600)]);
          p.setAttribute('d', poly(pts));
        });
      };
      draw(0);
      return { tick(now) { if (now - last < 40) return; last = now; draw(now); } };
    }
  };

  // Hatching that loses a line every now and then, then starts over.
  KINDS.erode = {
    w: 220, vb: [220, 220], label: () => 'EROSION, VERY SLOW', live: true,
    draw() {
      let s = '';
      for (let i = 0; i < 44; i++) s += '<path class="k" d="M' + (8 + i * 4.6) + ' 6L' + (6 + i * 4.6) + ' 214"/>';
      return '<g class="sk-cut">' + s + '</g>';
    },
    anim(el, r) {
      const lines = [...el.querySelectorAll('.sk-cut path')];
      let next = 0;
      return {
        tick(now) {
          if (now < next) return;
          next = now + 600 + r() * 900;
          const left = lines.filter((l) => !l.classList.contains('sk-gone'));
          if (!left.length) { lines.forEach((l) => l.classList.remove('sk-gone')); return; }
          pick(r, left).classList.add('sk-gone');
        }
      };
    }
  };

  // A still drawing with a damaged signal: it tears now and then.
  KINDS.signal = {
    w: 300, vb: [300, 340], reseed: true, label: () => pick(rand, ['SIGNAL DAMAGE', 'RECEIVED, PARTLY', 'TRANSMISSION 3 OF 3']), live: true,
    draw(r) {
      const inner = KINDS.head.draw(r);
      return '<g class="sk-base">' + inner + '</g><g class="sk-ghost sk-ghost-r">' + inner + '</g><g class="sk-ghost sk-ghost-b">' + inner + '</g>';
    },
    anim(el, r) {
      const base = el.querySelector('.sk-base'), gr = el.querySelector('.sk-ghost-r'), gb = el.querySelector('.sk-ghost-b');
      let next = 0, until = 0;
      const set = (on) => {
        if (!on) { [base, gr, gb].forEach((g) => { g.style.transform = ''; g.style.clipPath = ''; }); gr.style.opacity = gb.style.opacity = '0'; return; }
        const a = Math.floor(r() * 80), b = a + 5 + Math.floor(r() * 18);
        const clip = 'inset(' + a + '% 0 ' + (100 - b) + '% 0)';
        base.style.transform = 'translateX(' + f((r() - 0.5) * 24) + 'px)';
        gr.style.clipPath = gb.style.clipPath = clip;
        gr.style.opacity = gb.style.opacity = '1';
        gr.style.transform = 'translateX(' + f(4 + r() * 10) + 'px)';
        gb.style.transform = 'translateX(' + f(-4 - r() * 10) + 'px)';
      };
      set(false);
      return {
        tick(now) {
          if (now > until && until) { set(false); until = 0; next = now + 1800 + r() * 4000; return; }
          if (!next) next = now + 800 + r() * 2000;
          if (now > next && !until) { until = now + 120 + r() * 260; set(true); }
          else if (until && r() < 0.3) set(true);
        },
        still() { set(false); }
      };
    }
  };

  // ---- Simple ones ----------------------------------------------------------
  KINDS.circle = {
    w: 150, vb: [160, 160], reseed: true, label: () => pick(rand, ['NOT YET', 'ALMOST', 'CIRCLE, LEFT OPEN']),
    draw(r) { const pts = []; const gap = 0.3 + r() * 0.5; for (let i = 0; i <= 18; i++) { const a = gap + i / 18 * (Math.PI * 2 - gap); pts.push([80 + Math.cos(a) * (66 + (r() - 0.5) * 5), 80 + Math.sin(a) * (66 + (r() - 0.5) * 5)]); } return path('k k2', curve(pts)); }
  };
  KINDS.dots = {
    w: 140, vb: [160, 90], label: () => 'THREE',
    draw(r) { let s = ''; for (let i = 0; i < 3; i++) s += '<circle class="' + (i === 2 && r() < 0.5 ? 'f' : 'd') + '" cx="' + f(26 + i * 54 + (r() - 0.5) * 12) + '" cy="' + f(45 + (r() - 0.5) * 24) + '" r="' + f(4 + r() * 3) + '"/>'; return s; }
  };
  KINDS.door = {
    w: 130, vb: [140, 220], href: '../game/index.html', aria: 'A door, left open: walk to the door', label: () => 'A DOOR, FOR NOW',
    draw(r) { return path('k k2', hand(r, 20, 212, 20, 10, 3) + hand(r, 20, 10, 112, 12, 3) + hand(r, 112, 12, 114, 210, 3)) + path('k', poly([[20, 10], [70, 26], [70, 220], [20, 212]])) + '<circle class="f" cx="60" cy="118" r="4"/>' + path('g', hand(r, 0, 214, 140, 212, 2)); }
  };
  KINDS.arrow = {
    w: 200, vb: [220, 80], href: '../random/index.html', random: true, aria: 'An arrow: go somewhere else', label: () => 'THIS WAY (IT IS NOT)',
    draw(r) { return path('k k2', hand(r, 8, 44, 200, 40, 8)) + path('k k2', poly([[176, 22], [204, 40], [178, 60]])); }
  };
  KINDS.horizon = {
    w: 240, vb: [260, 60], label: () => 'HORIZON, SHORT',
    draw(r) { return path('k', hand(r, 4, 32, 256, 30, 2)) + '<circle class="f" cx="' + f(40 + r() * 180) + '" cy="22" r="7"/>'; }
  };
  KINDS.mark = {
    w: 110, vb: [120, 120], href: '../raw/index.html', aria: 'An X on the paper: repairing a memory', label: () => 'SOMETHING WAS BURIED HERE',
    draw(r) { return path('r k2', hand(r, 20, 20, 100, 100, 6) + hand(r, 100, 18, 22, 102, 6)); }
  };
  KINDS.spiral = {
    w: 170, vb: [180, 180], href: '../loop/index.html', aria: 'A spiral: go to loop 012', label: () => 'SPIRAL / DOES NOT CLOSE',
    draw(r) { const pts = []; const turns = 3 + r() * 2; for (let i = 0; i < 70; i++) { const t = i / 69, a = t * turns * Math.PI * 2; pts.push([90 + Math.cos(a) * (6 + t * 78), 90 + Math.sin(a) * (6 + t * 74)]); } return path('k', curve(pts)); }
  };

  // ---- Random stuff -----------------------------------------------------------
  const NOTES = {
    note: { w: 210, html: () => '<p class="sk-note" data-ero-food>remember: do not feed the drawings after midnight. <s>or before.</s></p>' },
    ticket: { w: 230, href: '../random/index.html', aria: 'A ticket stub: go to piece 07', html: () => '<p class="sk-ticket" data-ero-food>ADMIT ONE<br>PIECE 07<br><span class="sk-valid">VALID UNTIL ERODED</span></p>' },
    seen: { w: 200, html: () => '<p class="sk-note" data-ero-food>LAST SEEN AT<br>X ' + coord(rand() * 99999 - 50000) + '<br>Y ' + coord(rand() * 99999 - 50000) + '</p>' },
    missing: { w: 220, html: () => '<div class="sk-missing"><p data-ero-food>DRAWING MISSING<br>PROBABLY EATEN</p></div>' }
  };

  // ---- Building the sheet ------------------------------------------------------
  const scale = () => Math.min(1, Math.max(0.6, window.innerWidth / 1200));
  const items = [];

  function svgFor(kind, r) {
    const k = KINDS[kind];
    return '<svg viewBox="0 0 ' + k.vb[0] + ' ' + k.vb[1] + '" aria-hidden="true">' + k.draw.call(k, r) + '</svg>';
  }

  function makeItem(spec) {
    const isLink = !!spec.href;
    const el = document.createElement(isLink ? 'a' : 'div');
    el.className = 'sk-item sk-is-' + spec.kind;
    if (isLink) {
      el.href = spec.href;
      if (spec.aria) el.setAttribute('aria-label', spec.aria);
      if (spec.random) el.setAttribute('data-random', '');
    }
    const it = { el, kind: spec.kind, w: spec.w * scale(), h: 0, x: 0, y: 0, wx: 0, wy: 0, on: false, live: null, spec };
    el.style.width = it.w + 'px';
    // drawing units to px, so HTML laid over a drawing (the map) scales with it
    if (KINDS[spec.kind]) el.style.setProperty('--k', (it.w / KINDS[spec.kind].vb[0]).toFixed(3));
    sheet.appendChild(el);
    return it;
  }

  function fill(it) {
    const k = KINDS[it.kind];
    const r = mulberry(seed());
    if (k) {
      let html = svgFor(it.kind, r);
      if (k.links) html = '<div class="sk-map">' + html + '<div class="sk-nodes">' + k.overlay(k.nodes) + '</div></div>';
      if (!it.labelHTML) it.labelHTML = '<p class="sk-label" data-ero-food>' + k.label() + '</p>';
      if (!it.filled) { it.el.innerHTML = html + it.labelHTML; it.filled = true; }
      else it.el.querySelector('svg').outerHTML = html;
      if (it.live && it.live.stop) it.live.stop();
      it.live = k.anim ? k.anim(it.el, r) : null;
      if (it.live && reduce.matches && it.live.still) it.live.still();
    }
  }

  function addDrawing(kind) {
    const k = KINDS[kind];
    const it = makeItem({ kind, w: k.w, href: k.href, aria: k.aria, random: k.random });
    fill(it);
    it.h = it.w * k.vb[1] / k.vb[0] + 40;
    items.push(it);
  }

  function addNote(name) {
    const n = NOTES[name];
    const it = makeItem({ kind: name, w: n.w, href: n.href, aria: n.aria });
    it.el.innerHTML = n.html();
    it.h = 130;
    items.push(it);
  }

  // Marcus', collaborators' and found drawings (drawings.js).
  function addImage(d) {
    const it = makeItem({ kind: 'image', w: d.w || 360, href: d.href, aria: d.alt });
    const ratio = d.h && d.w ? d.h / d.w : 0.75;
    it.el.innerHTML = '<img src="' + d.src + '" alt="' + (d.alt || '').replace(/"/g, '&quot;') + '" loading="lazy" decoding="async">' +
      (d.label ? '<p class="sk-label" data-ero-food>' + d.label + '</p>' : '');
    it.h = it.w * ratio + (d.label ? 40 : 10);
    items.push(it);
  }

  const coord = (n) => (n < 0 ? '-' : '+') + String(Math.abs(Math.round(n))).padStart(5, '0');

  const pool = ['topo', 'flow', 'sphere', 'tree', 'specimen', 'blocks', 'head', 'moire', 'letters', 'map',
    'plotter', 'trying', 'breath', 'erode', 'signal',
    'circle', 'dots', 'door', 'arrow', 'horizon', 'mark', 'spiral'];
  // a second copy of some of the big ones, different every visit
  shuffle(rand, ['topo', 'flow', 'tree', 'sphere', 'head', 'moire']).slice(0, 3).forEach((k) => pool.push(k));
  const all = shuffle(rand, pool.map((k) => ['d', k]).concat(Object.keys(NOTES).map((k) => ['n', k])).concat((window.SK_DRAWINGS || []).map((d) => ['i', d])));
  all.forEach(([t, v]) => (t === 'd' ? addDrawing(v) : t === 'n' ? addNote(v) : addImage(v)));

  // ---- Placing them on the torus --------------------------------------------
  let TW = 0, TH = 0;
  const wrap = (v, m) => ((v % m) + m) % m;
  function place() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const maxW = Math.max(...items.map((i) => i.w)), maxH = Math.max(...items.map((i) => i.h));
    const area = items.reduce((s, i) => s + (i.w + 150) * (i.h + 150), 0) * 1.1;
    TW = Math.max(vw + 2 * maxW + 200, Math.sqrt(area * 1.5));
    TH = Math.max(vh + 2 * maxH + 200, area / TW);
    const placed = [];
    const clash = (a, x, y) => placed.reduce((s, b) => {
      const dx = Math.abs(wrap(x + a.w / 2 - b.x - b.w / 2 + TW / 2, TW) - TW / 2);
      const dy = Math.abs(wrap(y + a.h / 2 - b.y - b.h / 2 + TH / 2, TH) - TH / 2);
      const ox = (a.w + b.w) / 2 + 70 - dx, oy = (a.h + b.h) / 2 + 70 - dy;
      return s + (ox > 0 && oy > 0 ? ox * oy : 0);
    }, 0);
    for (const it of items) {
      let best = null, bestC = Infinity;
      for (let t = 0; t < 260 && bestC > 0; t++) {
        const x = rand() * TW, y = rand() * TH, c = clash(it, x, y);
        if (c < bestC) { best = [x, y]; bestC = c; }
      }
      it.x = best[0]; it.y = best[1];
      it.el.style.setProperty('--tilt', ((rand() - 0.5) * 3).toFixed(2) + 'deg');
      placed.push(it);
    }
  }
  place();

  // ---- The camera ---------------------------------------------------------------
  const cam = { x: 0, y: 0 }, vel = { x: 0, y: 0 };
  let goal = null;
  // start with one of the big drawings in view
  const first = items.find((i) => i.w > 280) || items[0];
  cam.x = first.x + first.w / 2 - window.innerWidth / 2 + (rand() - 0.5) * 200;
  cam.y = first.y + first.h / 2 - window.innerHeight / 2 + (rand() - 0.5) * 120;

  const grid = world.querySelector('.sk-grid');
  const readout = world.querySelector('.sk-coords');
  let moved = true, lastCam = { x: cam.x, y: cam.y };

  function render(now) {
    const vw = window.innerWidth, vh = window.innerHeight, M = 620;
    for (const it of items) {
      let sx = wrap(it.x - cam.x, TW), sy = wrap(it.y - cam.y, TH);
      if (sx > vw + M) sx -= TW;
      if (sy > vh + M) sy -= TH;
      // came back around the edge: maybe it is something else now
      const lap = Math.round((it.x - cam.x - sx) / TW) + ',' + Math.round((it.y - cam.y - sy) / TH);
      if (it.lap !== undefined && it.lap !== lap && KINDS[it.kind] && KINDS[it.kind].reseed && rand() < 0.5) fill(it);
      it.lap = lap;
      it.el.style.transform = 'translate3d(' + f(sx) + 'px,' + f(sy) + 'px,0) rotate(var(--tilt))';
      const on = sx < vw + 40 && sx + it.w > -40 && sy < vh + 40 && sy + it.h > -40;
      it.on = on;
      if (on && it.live && !reduce.matches) it.live.tick(now);
    }
    if (grid) grid.style.backgroundPosition = f(-wrap(cam.x, 120)) + 'px ' + f(-wrap(cam.y, 120)) + 'px,' + f(-wrap(cam.x, 600)) + 'px ' + f(-wrap(cam.y, 600)) + 'px';
    if (readout) readout.textContent = 'X ' + coord(cam.x + vw / 2) + '  Y ' + coord(-(cam.y + vh / 2));
  }

  // The creatures ride along with the paper; the edge of the window pushes them back in.
  function carry(dx, dy) {
    const ERO = window.ERO;
    if (!ERO || !ERO.all) return;
    const W = world.clientWidth, H = world.clientHeight;
    for (const c of ERO.all) {
      if (!c.B || !c.teleport) continue;
      const nx = Math.min(W - 24, Math.max(24, c.B.x - dx)), ny = Math.min(H - 24, Math.max(24, c.B.y - dy));
      if (nx !== c.B.x || ny !== c.B.y) c.teleport(nx - c.B.x, ny - c.B.y);
      if (c.draw) c.draw();
    }
    if (ERO.words) ERO.words.measure();
  }

  let looping = false;
  function loop(now) {
    if (goal) {
      const k = reduce.matches ? 1 : 0.12;
      cam.x += (goal.x - cam.x) * k; cam.y += (goal.y - cam.y) * k;
      if (Math.abs(goal.x - cam.x) + Math.abs(goal.y - cam.y) < 0.5) goal = null;
    } else if (!drag.on && (Math.abs(vel.x) + Math.abs(vel.y) > 0.05)) {
      cam.x += vel.x; cam.y += vel.y;
      vel.x *= 0.93; vel.y *= 0.93;
    }
    const dx = cam.x - lastCam.x, dy = cam.y - lastCam.y;
    if (dx || dy) { moved = true; lastCam = { x: cam.x, y: cam.y }; }
    render(now);
    if (moved && (dx || dy)) carry(dx, dy);
    moved = false;
    if (document.hidden) { looping = false; return; }
    requestAnimationFrame(loop);
  }
  function go() { if (!looping) { looping = true; requestAnimationFrame(loop); } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) go(); });
  window.addEventListener('resize', () => { go(); });

  // ---- Moving around --------------------------------------------------------------
  const hint = world.querySelector('.sk-hint');
  const used = () => { if (hint) hint.classList.add('sk-used'); };
  const drag = { on: false, down: false, x: 0, y: 0, sx: 0, sy: 0, t: 0, id: null, swallow: false };
  const mine = (e) => {
    const t = e.target;
    if (!t.closest || !world.contains(t)) return false;
    if (t.closest('#figure .hit')) return false;               // a creature: page.js
    if (t.closest('.ero-egg')) return false;                  // an egg: click to hatch
    if (t.closest('.ero-w') && !t.closest('a')) return false; // a word: hold it to feed
    return true;
  };
  world.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !mine(e)) return;
    Object.assign(drag, { down: true, on: false, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), id: e.pointerId });
    vel.x = vel.y = 0; goal = null;
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag.down || e.pointerId !== drag.id) return;
    if (!drag.on && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
      drag.on = true;
      world.classList.add('sk-grabbing');
      try { world.setPointerCapture(e.pointerId); } catch (_) { /* fine without */ }
      used();
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
    world.classList.remove('sk-grabbing');
    go();
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  // a drag that ends on a drawing is not a click on it
  window.addEventListener('click', (e) => { if (drag.swallow) { e.preventDefault(); e.stopImmediatePropagation(); drag.swallow = false; } }, true);

  world.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // pinch zoom stays the browser's
    e.preventDefault();
    const k = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? window.innerHeight : 1;
    let dx = e.deltaX * k, dy = e.deltaY * k;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    cam.x += dx; cam.y += dy; goal = null; vel.x = vel.y = 0;
    used(); go();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || /input|textarea|select/i.test(e.target.tagName)) return;
    const step = e.shiftKey ? 600 : 220;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step], a: [-step, 0], d: [step, 0], w: [0, -step], s: [0, step] };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    const from = goal || cam;
    goal = { x: from.x + m[0], y: from.y + m[1] };
    vel.x = vel.y = 0;
    used(); go();
  });

  // Tabbing to a drawing brings it to the middle of the window.
  sheet.addEventListener('focusin', (e) => {
    const el = e.target.closest('.sk-item');
    const it = el && items.find((i) => i.el === el);
    if (!it) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    let sx = wrap(it.x - cam.x, TW), sy = wrap(it.y - cam.y, TH);
    if (sx > vw + 620) sx -= TW;
    if (sy > vh + 620) sy -= TH;
    goal = { x: cam.x + sx + it.w / 2 - vw / 2, y: cam.y + sy + it.h / 2 - vh / 2 };
    world.scrollLeft = world.scrollTop = 0;
    go();
  });
  world.addEventListener('scroll', () => { world.scrollLeft = world.scrollTop = 0; });

  render(performance.now());
  go();
})();
