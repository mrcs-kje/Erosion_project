/*
  EROSION.EXE: the word layer.

  - wrap() puts every word of the article in <span class="ero-w"> so the
    creatures can find it. The text itself is never changed, only wrapped.
  - measure() records where each word sits, in "world" pixels (measured from
    the top-left of #world), and files it in a coarse grid so a creature only
    has to look at the few words near it instead of all of them.
  - Gripping and swallowing only add CSS classes. reset() removes them again.
*/
(() => {
  'use strict';

  const ERO = window.ERO = window.ERO || {};
  const CELL = 64; // grid cell size in px
  const world = document.getElementById('world');
  const list = [];
  let grid = new Map();
  let swallowed = 0;

  function wrap(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of node.nodeValue.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
        const span = document.createElement('span');
        span.className = 'ero-w';
        span.textContent = part;
        frag.appendChild(span);
        list.push({ el: span, len: part.length, x: 0, y: 0, w: 0, h: 0, feet: 0, bites: 0, gone: false });
      }
      node.parentNode.replaceChild(frag, node);
    }
  }

  function measure() {
    const o = world.getBoundingClientRect();
    grid = new Map();
    list.forEach((w, i) => {
      const r = w.el.getBoundingClientRect();
      w.x = r.left - o.left;
      w.y = r.top - o.top;
      w.w = r.width;
      w.h = r.height;
      const cy = Math.floor((w.y + w.h / 2) / CELL);
      for (let cx = Math.floor(w.x / CELL); cx <= Math.floor((w.x + w.w) / CELL); cx++) {
        const key = cx + ',' + cy;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
    });
  }

  // Call fn for every word in the grid cells around (x, y).
  function near(x, y, r, fn) {
    const x1 = Math.floor((x + r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cy = Math.floor((y - r) / CELL); cy <= y1; cy++) {
      for (let cx = Math.floor((x - r) / CELL); cx <= x1; cx++) {
        const cell = grid.get(cx + ',' + cy);
        if (cell) for (const i of cell) fn(list[i]);
      }
    }
  }

  // The centre of the letter in word w that is closest to x.
  function letter(w, x) {
    const k = Math.min(w.len - 1, Math.max(0, Math.floor((x - w.x) / w.w * w.len)));
    return { x: w.x + (k + 0.5) * w.w / w.len, y: w.y + w.h * 0.55 };
  }

  // Best letter to plant a foot on: close to where the foot wants to go,
  // and still within reach of the hip. Swallowed words can't be gripped.
  function foothold(x, y, radius, hip, maxReach) {
    let best = null, bestD = radius;
    near(x, y, radius, (w) => {
      if (w.gone) return;
      const p = letter(w, x);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD && Math.hypot(p.x - hip.x, p.y - hip.y) < maxReach) {
        bestD = d;
        best = { word: w, x: p.x, y: p.y };
      }
    });
    return best;
  }

  // A word lying right under (x, y), if any.
  function under(x, y, r) {
    let found = null;
    near(x, y, r, (w) => {
      if (!found && !w.gone && x > w.x - r && x < w.x + w.w + r && y > w.y - r && y < w.y + w.h + r) found = w;
    });
    return found;
  }

  // Nearest uneaten word in front of a creature (inside a cone around `angle`).
  function ahead(x, y, angle, radius, minCos) {
    let best = null, bestD = radius;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    near(x, y, radius, (w) => {
      if (w.gone) return;
      const cx = w.x + w.w / 2, cy = w.y + w.h * 0.55;
      const dx = cx - x, dy = cy - y;
      const d = Math.hypot(dx, dy) || 0.001;
      if (d < bestD && (dx * ux + dy * uy) / d > minCos) { bestD = d; best = w; }
    });
    return best;
  }

  // A random uneaten word somewhere between two heights (a place to roam to).
  function random(minY, maxY) {
    for (let tries = 0; tries < 40; tries++) {
      const w = list[Math.floor(Math.random() * list.length)];
      if (!w.gone && w.y >= minY && w.y <= maxY) return w;
    }
    return null;
  }

  function grip(w) {
    w.feet++;
    w.bites++;
    w.el.classList.add('ero-gripped');
    if (w.bites >= 4) w.el.classList.add('ero-worn'); // stood on too often
  }

  function release(w) {
    w.feet = Math.max(0, w.feet - 1);
    if (w.feet === 0) w.el.classList.remove('ero-gripped');
  }

  function swallow(w) {
    if (w.gone) return;
    w.gone = true;
    swallowed++;
    w.el.classList.add('ero-swallowed');
  }

  function reset() {
    swallowed = 0;
    list.forEach((w) => {
      w.feet = 0; w.bites = 0; w.gone = false;
      w.el.classList.remove('ero-gripped', 'ero-worn', 'ero-swallowed');
    });
  }

  ERO.words = {
    wrap, measure, foothold, under, ahead, random, grip, release, swallow, reset, letter,
    get swallowed() { return swallowed; }
  };
})();
