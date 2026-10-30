/*
  EROSION.EXE demo 07: the page and the loop.

  - Wraps the article's words (words.js) and creates the three nest
    creatures (creatures.js) on one SVG layer that covers the whole page.
  - MUTANTS come and go: two crawl out of every fifth form that splits, and
    now and then one hatches out of a word on screen. At most MAX_POP
    creatures live on the page at once. PURGE removes the mutants.
  - Positions are in "world" pixels: measured from the top-left of #world,
    so creatures scroll with the text like they are sitting on it.
  - The loop runs at a fixed 60 steps per second while anything is awake
    or still settling, and stops completely when everything is asleep.
*/
(() => {
  'use strict';

  const ERO = window.ERO;
  const STEP = 1000 / 60;

  const world = document.getElementById('world');
  const svg = document.getElementById('figure');
  const bar = document.querySelector('.bar');
  const countEl = document.getElementById('count');
  const purgeBtn = document.getElementById('purge');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const MAX_POP = 12;              // creatures on the page at most
  const WILD_MAX = 7;              // no wild hatching above this many
  const WILD_MS = [40000, 80000];  // time between wild hatchings

  ERO.words.wrap(document.getElementById('article'));

  // Everything the creatures need to know about the page, shared with them.
  const env = {
    W: 0, H: 0, scale: 1,
    view: { top: 0, bottom: 0 },          // the visible part of the world
    ptr: { x: 0, y: 0, on: false, vx: 0, vy: 0 }, // the cursor, in world pixels (v = px per step)
    dragged: null,
    grab: { x: 0, y: 0 },                  // where on the creature it was grabbed
    reduceMotion: reduceMotion.matches
  };
  const client = { x: 0, y: 0, known: false };

  const creatures = {
    snake: ERO.makeSnake(svg),
    crawler: ERO.makeCrawler(svg),
    strider: ERO.makeStrider(svg)
  };
  const all = Object.values(creatures); // nest creatures first, then mutants
  env.creatures = all;       // so they can keep their distance from each other
  ERO.creatures = creatures; // handy for poking at them in the browser console
  ERO.all = all;

  let running = false;
  let last = 0;
  let acc = 0;
  let shownCount = '';

  // ---- Buttons, nest labels and tapping ------------------------------------
  const ui = new Map();
  for (const [key, c] of Object.entries(creatures)) {
    const btn = document.querySelector('[data-wake="' + key + '"]');
    const cell = document.querySelector('.ero-cell[data-home="' + key + '"]');
    ui.set(c, {
      btn, cell, text: '',
      state: btn.querySelector('.ero-state'),
      label: cell.querySelector('.ero-state'),
      names: [btn.querySelector('.ero-name'), cell.querySelector('.ero-name')]
    });

    btn.addEventListener('click', () => {
      if (c.alive) c.sleep();
      else wake(c, true);
      start();
    });

    attach(c);
  }

  // Tapping a creature wakes it; pressing on an awake one catches it.
  function attach(c) {
    c.hits.forEach((hit) => {
      hit.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        setPointer(e);
        if (!c.alive) {
          wake(c, false);
        } else {
          env.dragged = c; // you caught it
          env.grab.x = c.B.x - env.ptr.x;
          env.grab.y = c.B.y - env.ptr.y;
          hit.setPointerCapture(e.pointerId);
        }
        start();
      });
    });
  }

  // ---- Mutants ---------------------------------------------------------------
  function spawnMutant(x, y, kind) {
    if (all.length >= MAX_POP) return null;
    const m = ERO.makeMutant(svg, kind);
    attach(m);
    m.setHome(x, y, env.scale);
    m.bornAt(x, y);
    all.push(m);
    start();
    return m;
  }
  ERO.spawnMutant = spawnMutant; // console: ERO.spawnMutant(400, 600, 'ribs')

  // A fifth form split: two small mutants crawl out of the pieces.
  ERO.onSplit = (parent, x, y) => {
    const kinds = ERO.mutantKinds.slice().sort(() => Math.random() - 0.5);
    spawnMutant(x - 30, y, kinds[0]);
    spawnMutant(x + 30, y, kinds[1]);
  };

  // A word on screen for something to hatch out of.
  ERO.hatchWord = () => ERO.words.random(env.view.top + 40, env.view.bottom - 40);

  // Now and then a mutant hatches out of a word by itself (only while
  // something is awake, so a quiet page stays quiet).
  let nextWild = 0;
  function wildHatch(now) {
    if (!nextWild) nextWild = now + WILD_MS[0] * 0.5;
    if (now < nextWild || ERO.debris.hatching || all.length >= WILD_MAX) return;
    if (!all.some((c) => c.alive)) return;
    nextWild = now + WILD_MS[0] + Math.random() * (WILD_MS[1] - WILD_MS[0]);
    const w = ERO.hatchWord();
    if (w) ERO.debris.hatch(w, now, (x, y) => spawnMutant(x, y));
  }

  function removeDead() {
    for (let i = all.length - 1; i >= 0; i--) {
      const c = all[i];
      if (!c.mutant || !c.removed) continue;
      if (env.dragged === c) env.dragged = null;
      c.destroy();
      all.splice(i, 1);
    }
  }

  function wake(c, fromButton) {
    // Woken from the bar while far away: drop it just off the edge of the
    // screen so it crawls into view.
    if (fromButton) {
      const { top, bottom } = env.view;
      if (c.B.y < top - 40) c.teleport(0, top - 60 - c.B.y);
      else if (c.B.y > bottom + 40) c.teleport(0, bottom + 60 - c.B.y);
    }
    c.wake();
  }

  function purge() {
    env.dragged = null;
    all.forEach((c) => {
      if (c.mutant) c.removed = true;
      else { c.sleep(); c.reset(); }
    });
    removeDead();
    ERO.words.reset();
    ERO.debris.clearDrops();
    nextWild = 0;
    start(); // run until everything has settled back into the nest
  }

  function updateUI() {
    for (const [c, u] of ui) {
      const text = c.name + ' ' + c.mood + ' / ' + c.label();
      if (text === u.text) continue;
      u.text = text;
      u.names.forEach((el) => { el.textContent = c.name; }); // the snake can become a squid
      u.state.textContent = c.mood;
      u.label.textContent = c.mood + ' / ' + c.label();
      u.btn.setAttribute('aria-pressed', String(c.alive));
    }
    const n = ERO.words.swallowed;
    const pop = all.filter((c) => !c.gone).length;
    const key = n + '/' + pop;
    if (key !== shownCount) {
      shownCount = key;
      countEl.textContent = n + (n === 1 ? ' WORD' : ' WORDS') + ' SWALLOWED / ' + pop + ' ALIVE';
    }
  }

  // ---- Pointer and view ----------------------------------------------------
  function setPointer(e) {
    // How fast the mouse is moving, smoothed (used to throw creatures).
    const t = performance.now();
    if (client.known && client.t) {
      const dt = Math.max(1, t - client.t);
      env.ptr.vx = env.ptr.vx * 0.5 + (e.clientX - client.x) / dt * STEP * 0.5;
      env.ptr.vy = env.ptr.vy * 0.5 + (e.clientY - client.y) / dt * STEP * 0.5;
    }
    client.t = t;
    client.x = e.clientX;
    client.y = e.clientY;
    client.known = true;
    updateView();
  }

  function updateView() {
    const r = world.getBoundingClientRect();
    env.view.top = -r.top + bar.offsetHeight;
    env.view.bottom = -r.top + window.innerHeight;
    env.ptr.x = client.x - r.left;
    env.ptr.y = client.y - r.top;
    env.ptr.on = client.known && client.y > bar.offsetHeight;
  }

  function layout() {
    env.W = world.clientWidth;
    env.H = world.clientHeight;
    env.scale = Math.min(1, Math.max(0.72, window.innerWidth / 1000));
    svg.setAttribute('viewBox', '0 0 ' + env.W + ' ' + env.H);
    ERO.words.measure();
    const o = world.getBoundingClientRect();
    for (const [c, u] of ui) {
      const r = u.cell.getBoundingClientRect();
      c.setHome(r.left - o.left + r.width / 2, r.top - o.top + r.height * 0.45, env.scale);
    }
    updateView();
    all.forEach((c) => c.draw());
  }

  // ---- Loop ----------------------------------------------------------------
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
  ERO.start = start; // console shortcuts use this to get the loop going

  function tick(now) {
    if (document.hidden) { running = false; return; }
    updateView();
    env.reduceMotion = reduceMotion.matches;
    acc += Math.min(now - last, 100);
    last = now;
    while (acc >= STEP) {
      for (const c of all.slice()) c.step(now, env);
      ERO.debris.step(now);
      wildHatch(now);
      acc -= STEP;
    }
    removeDead();
    // No lag: a creature you hold, or one clinging to the cursor, is moved
    // as a whole to sit exactly under the pointer right before drawing.
    for (const c of all) {
      let dx = 0, dy = 0;
      if (env.dragged === c) {
        dx = env.ptr.x + env.grab.x - c.B.x;
        dy = env.ptr.y + env.grab.y - c.B.y;
      } else if (c.mood === 'CLINGING' && env.ptr.on) {
        const m = c.mouthAt();
        dx = env.ptr.x - m.x;
        dy = env.ptr.y - m.y;
      }
      if (Math.abs(dx) + Math.abs(dy) > 0.3) c.teleport(dx, dy);
    }
    for (const c of all) c.draw();
    ERO.debris.draw(now);
    updateUI();
    if (ERO.debris.active || all.some((c) => c.alive || !c.settled())) {
      requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  // ---- Events --------------------------------------------------------------
  window.addEventListener('pointermove', setPointer);
  document.documentElement.addEventListener('pointerleave', () => { client.known = false; env.ptr.on = false; });
  window.addEventListener('pointerup', (e) => {
    if (env.dragged) {
      // Let go while moving: throw it. (A mouse held still drops it.)
      const still = performance.now() - client.t > 80;
      env.dragged.fling(still ? 0 : env.ptr.vx * 1.3, still ? 0 : env.ptr.vy * 1.3);
      env.dragged = null;
    }
    if (e.pointerType !== 'mouse') client.known = false; // a lifted finger is gone
  });
  window.addEventListener('pointercancel', () => { env.dragged = null; client.known = false; });
  purgeBtn.addEventListener('click', purge);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && all.some((c) => c.alive || !c.settled())) start();
  });
  new ResizeObserver(layout).observe(world);

  layout();
  updateUI();
})();
