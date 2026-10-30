/*
  EROSION.EXE demo 02: the page and the loop.

  - Wraps the article's words (words.js) and creates the three creatures
    (creatures.js) on one SVG layer that covers the whole page.
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

  ERO.words.wrap(document.getElementById('article'));

  // Everything the creatures need to know about the page, shared with them.
  const env = {
    W: 0, H: 0, scale: 1,
    view: { top: 0, bottom: 0 },          // the visible part of the world
    ptr: { x: 0, y: 0, on: false },        // the cursor, in world pixels
    dragged: null,
    reduceMotion: reduceMotion.matches
  };
  const client = { x: 0, y: 0, known: false };

  const creatures = {
    snake: ERO.makeSnake(svg),
    crawler: ERO.makeCrawler(svg),
    strider: ERO.makeStrider(svg)
  };
  const all = Object.values(creatures);
  env.creatures = all;       // so they can keep their distance from each other
  ERO.creatures = creatures; // handy for poking at them in the browser console

  let running = false;
  let last = 0;
  let acc = 0;
  let shownCount = -1;

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

    c.hits.forEach((hit) => {
      hit.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        setPointer(e);
        if (!c.alive) {
          wake(c, false);
        } else {
          env.dragged = c; // you caught it
          hit.setPointerCapture(e.pointerId);
        }
        start();
      });
    });
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
    all.forEach((c) => { c.sleep(); c.reset(); });
    ERO.words.reset();
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
    if (n !== shownCount) {
      shownCount = n;
      countEl.textContent = n + (n === 1 ? ' WORD' : ' WORDS') + ' SWALLOWED';
    }
  }

  // ---- Pointer and view ----------------------------------------------------
  function setPointer(e) {
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

  function tick(now) {
    if (document.hidden) { running = false; return; }
    updateView();
    env.reduceMotion = reduceMotion.matches;
    acc += Math.min(now - last, 100);
    last = now;
    while (acc >= STEP) {
      for (const c of all) c.step(now, env);
      acc -= STEP;
    }
    for (const c of all) c.draw();
    updateUI();
    if (all.some((c) => c.alive || !c.settled())) {
      requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  // ---- Events --------------------------------------------------------------
  window.addEventListener('pointermove', setPointer);
  document.documentElement.addEventListener('pointerleave', () => { client.known = false; env.ptr.on = false; });
  window.addEventListener('pointerup', (e) => {
    env.dragged = null;
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
