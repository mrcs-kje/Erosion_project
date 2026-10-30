/*
  EROSION.EXE: the word layer.

  - wrap() puts every word of the article in <span class="ero-w"> so the
    creatures can find it. The text itself is never changed, only wrapped.
  - measure() records where each word sits, in "world" pixels (measured from
    the top-left of #world), and files it in a coarse grid so a creature only
    has to look at the few words near it instead of all of them.
  - Gripping and swallowing only add CSS classes. reset() removes them again.
  - Demo 07: words can CRACK open (a creature hatches out of them), a
    swallowed word leaves a SCAR that a creature may later drop another word
    into, and words inside links (<a href="#...">) are doors: a creature
    that walks into one comes out at the place the link points to.
  - Demo 09: links to OTHER pages are exits. Words inside them get `page`
    (the address), and door() adds a link with no words of its own (a
    drawing, a drawn door). randomExit() picks one of them.
*/
(() => {
  'use strict';

  const ERO = window.ERO = window.ERO || {};
  const CELL = 64; // grid cell size in px
  const world = document.getElementById('world');
  const list = [];
  const doors = []; // links with no words of their own (see door())
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
        const a = node.parentNode.closest ? node.parentNode.closest('a[href]') : null;
        const href = a ? a.getAttribute('href') : '';
        list.push({
          el: span, text: part, len: part.length, x: 0, y: 0, w: 0, h: 0, feet: 0, bites: 0, gone: false,
          link: href[0] === '#' ? href : null, page: a ? outward(a) : null, filled: false
        });
      }
      node.parentNode.replaceChild(frag, node);
    }
  }

  // Where a link to another page of this site goes, or null (an in-page
  // link, another site, a new tab, a download).
  function outward(a) {
    const href = a.getAttribute('href');
    if (!href || href[0] === '#' || a.target === '_blank' || a.hasAttribute('download')) return null;
    try {
      const u = new URL(a.href);
      return /^(https?|file):$/.test(u.protocol) && u.origin === location.origin ? u.href : null;
    } catch (_) { return null; }
  }

  // A link with no words of its own (a drawing, a drawn door) is an exit too.
  function door(a) {
    const page = outward(a);
    if (page && !doors.some((d) => d.el === a)) {
      doors.push({ el: a, text: '', len: 0, x: 0, y: 0, w: 0, h: 0, gone: false, link: null, page, door: true });
    }
  }

  function measure() {
    const o = world.getBoundingClientRect();
    doors.forEach((d) => {
      const r = d.el.getBoundingClientRect();
      Object.assign(d, { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height });
    });
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

  // A random word inside a link (a door to another part of the page).
  function randomLink(minY, maxY) {
    const doors = list.filter((w) => w.link && !w.gone && w.y >= minY && w.y <= maxY);
    return doors.length ? doors[Math.floor(Math.random() * doors.length)] : null;
  }

  // A random exit: a word or a drawing inside a link to another page.
  function randomExit(minY, maxY) {
    const exits = list.concat(doors).filter((w) => w.page && !w.gone && w.w > 0 && w.y >= minY && w.y <= maxY);
    return exits.length ? exits[Math.floor(Math.random() * exits.length)] : null;
  }

  // An exit that leads to `path` (as ERO.travel.path() gives it), if any.
  function exitTo(path) {
    const exits = list.concat(doors).filter((w) => w.page && w.w > 0 && ERO.travel && ERO.travel.path(w.page) === path);
    return exits.length ? exits[Math.floor(Math.random() * exits.length)] : null;
  }

  // Where a link leads: the top-left of the element it points to, in world pixels.
  function target(href) {
    const el = href && document.getElementById(href.slice(1));
    if (!el) return null;
    const o = world.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - o.left + 40, y: r.top - o.top + r.height / 2 };
  }

  // A scar left by a swallowed word that nothing has been dropped into yet.
  function scar(minY, maxY) {
    for (let tries = 0; tries < 60; tries++) {
      const w = list[Math.floor(Math.random() * list.length)];
      if (w.gone && !w.filled && w.y >= minY && w.y <= maxY) return w;
    }
    return null;
  }

  // A creature is hatching out of this word: it flickers, then is gone.
  function crack(w) {
    w.el.classList.add('ero-cracking');
  }
  function hatched(w) {
    w.el.classList.remove('ero-cracking');
    swallow(w);
    w.el.classList.add('ero-hatched');
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
      w.feet = 0; w.bites = 0; w.gone = false; w.filled = false;
      w.el.classList.remove('ero-gripped', 'ero-worn', 'ero-swallowed', 'ero-cracking', 'ero-hatched', 'ero-portal');
    });
    doors.forEach((d) => d.el.classList.remove('ero-portal'));
  }

  ERO.words = {
    wrap, measure, foothold, under, ahead, random, randomLink, randomExit, exitTo, door, target, scar, crack, hatched,
    grip, release, swallow, reset, letter,
    get swallowed() { return swallowed; },
    get list() { return list; } // every wrapped word (read only, please)
  };
})();
