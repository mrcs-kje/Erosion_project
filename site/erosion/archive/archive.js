/*
  Erosion.exe archive: the page and the loop.

  The crawlers themselves live in ../crawlers/ (words.js + creatures.js,
  copied from Erosion_test_features/erosion-crawlers/crawler_test_09).
  This file is that demo's main.js fitted to the archive page, plus:
  - SELECTED: the last creature you tapped, caught or woke, with its food
    and fondness, and LAB buttons that skip ahead (pupate, split, kill,
    hatch a mutant) so every form can be tested quickly.
  - LOG: what happened on the page, with the time.
  - INTERCEPT in the header glitches out to the 404 page, as on the front page.
  - FEEDING (demo 13): hold a word to pull it out of the article, let go on
    a creature (it eats from your hand) or anywhere (it lies there as food).
  - SNAKE EGGS and the SQUID line (demo 14): a full-grown snake lays eggs
    that hatch into snakes (ERO.hatchLine); a wild hatching is now and then
    a squid (INKLING) instead of a glyph crawler.
  - SUMMON (demo 12): pick any line and stage from ERO.catalog and it
    hatches out of a word on screen, at that stage.
  - TRAVEL: links to other pages are exits (see ERO.travel in creatures.js).
    Wild creatures slip through them, fond ones follow your clicks, and
    creatures that went to the archive come in when it opens.

  Positions are in "world" pixels, measured from the top-left of #world.
  The loop runs at 60 steps per second while anything is awake or
  settling, and stops completely when everything is asleep.
*/
(() => {
  'use strict';

  const ERO = window.ERO;
  const STEP = 1000 / 60;

  const world = document.getElementById('world');
  const svg = document.getElementById('figure');
  const countEl = document.getElementById('count');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const MAX_POP = 12;              // creatures on the page at most
  const WILD_MAX = 7;              // no wild hatching above this many
  const WILD_MS = [40000, 80000];  // time between wild hatchings
  const LOG_MAX = 10;

  ERO.words.wrap(document.getElementById('article'));
  world.querySelectorAll('a[href]').forEach((a) => { if (!a.querySelector('.ero-w')) ERO.words.door(a); });

  const env = {
    W: 0, H: 0, scale: 1,
    view: { top: 0, bottom: 0 },
    ptr: { x: 0, y: 0, on: false, vx: 0, vy: 0 },
    dragged: null,
    grab: { x: 0, y: 0 },
    reduceMotion: reduceMotion.matches
  };
  const client = { x: 0, y: 0, known: false };

  const creatures = {
    snake: ERO.makeSnake(svg),
    crawler: ERO.makeCrawler(svg),
    strider: ERO.makeStrider(svg)
  };
  const all = Object.values(creatures); // nest creatures first, then mutants
  env.creatures = all;
  ERO.creatures = creatures; // for poking at them in the browser console
  ERO.all = all;

  // Neutral names for the panel and the log: the page does not say what
  // lives here. The three dormant ones are 01-03, newcomers get N01, N02...
  const tags = new Map([[creatures.crawler, '01'], [creatures.snake, '02'], [creatures.strider, '03']]);
  let newTags = 0;
  function tag(c) {
    if (!tags.has(c)) tags.set(c, 'N' + String(++newTags).padStart(2, '0'));
    return tags.get(c);
  }

  let running = false;
  let last = 0;
  let acc = 0;
  let shownCount = '';
  let selected = creatures.crawler;

  // ---- Log -------------------------------------------------------------------
  const logList = document.getElementById('log-list');
  function log(text) {
    const d = new Date();
    const li = document.createElement('li');
    const t = document.createElement('time');
    t.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    li.append(t, text);
    li.className = 'is-new';
    logList.querySelectorAll('.is-new').forEach((el) => el.classList.remove('is-new'));
    logList.prepend(li); // newest on top
    while (logList.children.length > LOG_MAX) logList.lastElementChild.remove();
  }

  // What each creature looked like last frame, to notice changes.
  const seen = new Map();
  function watch(c) {
    const s = seen.get(c);
    const now = { name: c.name, alive: c.alive, gone: c.gone, fond: c.fondOn };
    seen.set(c, now);
    if (!s) return;
    const t = tag(c);
    if (!s.gone && now.gone) log(t + (c.left ? ' LEFT THROUGH A LINK' : ' FELL APART'));
    else if (s.gone && !now.gone) log(t + ' CAME OUT OF A WORD');
    else if (!now.gone && s.name !== now.name) {
      if (now.name === 'PUPA') log(t + ' WENT STILL');
      else if (s.name === 'PUPA') log(t + ' MOVED AGAIN');
      else log(t + ' CHANGED');
    } else if (!now.gone && s.alive !== now.alive) {
      log(t + (now.alive ? ' WOKE UP' : ' WENT BACK TO SLEEP'));
    }
    if (!s.fond && now.fond) log(t + ' STAYS NEAR YOU');
    else if (s.fond && !now.fond && !now.gone) log(t + ' LOST INTEREST');
  }

  // ---- Nest creatures: buttons, nest labels ---------------------------------
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
      select(c);
      if (c.alive) c.sleep();
      else wake(c, true);
      start();
    });
    attach(c);
  }

  // Tapping a creature wakes it; pressing on an awake one catches it;
  // pressing twice quickly damages it.
  const tap = { c: null, t: 0, x: 0, y: 0 };
  function attach(c) {
    c.hits.forEach((hit) => {
      hit.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        setPointer(e);
        select(c);
        // Second press on the same creature, quickly and in the same spot: damage.
        const t = performance.now();
        if (c.alive && tap.c === c && t - tap.t < 350 && Math.hypot(env.ptr.x - tap.x, env.ptr.y - tap.y) < 40) {
          tap.c = null;
          if (ERO.zap(c, { x: env.ptr.x, y: env.ptr.y }, t)) log(tag(c) + ' WAS HIT');
          start();
          return;
        }
        Object.assign(tap, { c, t, x: env.ptr.x, y: env.ptr.y });
        if (!c.alive) {
          wake(c, false);
        } else {
          env.dragged = c;
          env.grab.x = c.B.x - env.ptr.x;
          env.grab.y = c.B.y - env.ptr.y;
          hit.setPointerCapture(e.pointerId);
        }
        start();
      });
    });
  }

  function select(c) {
    selected = c;
    shownSel = '';
  }

  // ---- Mutants ---------------------------------------------------------------
  function spawnMutant(x, y, kind) {
    if (all.length >= MAX_POP) return null;
    const m = ERO.makeMutant(svg, kind);
    attach(m);
    m.setHome(x, y, env.scale);
    m.bornAt(x, y);
    all.push(m);
    seen.set(m, { name: m.name, alive: m.alive, gone: m.gone, fond: false });
    log(tag(m) + ' APPEARED');
    start();
    return m;
  }
  ERO.spawnMutant = spawnMutant;
  // A snake egg hatching (demo 14), and how many more creatures fit.
  ERO.hatchLine = (x, y, line) => {
    const c = summonAt(x, y, line, null, 1);
    if (c) log(tag(c) + ' CAME OUT OF AN EGG');
    return c;
  };
  ERO.room = () => MAX_POP - all.length;
  // Building (demo 15): a mended dead link (and when it dies again) goes in the log.
  ERO.note = (text) => log(text);

  ERO.onSplit = (parent, x, y) => {
    log(tag(parent) + ' SPLIT IN TWO');
    if (parent.line === 'siphon' || parent.line === 'squid') {
      // A colony sheds two polyps, a kraken bursts into two specks.
      [-30, 30].forEach((dx) => summonAt(x + dx, y, parent.line, null, 1));
      return;
    }
    const kinds = ERO.mutantKinds.slice().sort(() => Math.random() - 0.5);
    spawnMutant(x - 30, y, kinds[0]);
    spawnMutant(x + 30, y, kinds[1]);
  };

  ERO.hatchWord = () => ERO.words.random(env.view.top + 40, env.view.bottom - 40);

  // ---- Summon: any line, at any stage ----------------------------------------
  // A new wild creature of that line and stage at (x, y).
  function summonAt(x, y, line, kind, stage) {
    if (all.length >= MAX_POP) return null;
    const c = ERO.travel.make(svg, { line, kind });
    if (!c) return null;
    attach(c);
    c.setHome(x, y, env.scale);
    c.arrive(x, y, { stage, eaten: 0, fond: 0 });
    all.push(c);
    seen.set(c, { name: c.name, alive: c.alive, gone: c.gone, fond: false });
    start();
    return c;
  }
  const summonKind = document.getElementById('summon-kind');
  const summonGo = document.getElementById('summon-go');
  if (summonKind && summonGo && ERO.catalog) {
    ERO.catalog.forEach((line) => {
      const group = document.createElement('optgroup');
      group.label = line.names[0];
      line.names.forEach((name, i) => {
        const opt = document.createElement('option');
        opt.value = line.line + '/' + (line.kind || '') + '/' + (i + 1);
        opt.textContent = (i + 1) + ' / ' + name;
        group.append(opt);
      });
      summonKind.append(group);
    });
    summonGo.addEventListener('click', () => {
      if (all.length >= MAX_POP) { log('THE PAGE IS FULL'); return; }
      const [line, kind, stage] = summonKind.value.split('/');
      const come = (x, y) => {
        const c = summonAt(x, y, line, kind || null, +stage);
        if (c) { log(tag(c) + ' WAS CALLED'); select(c); }
      };
      const w = ERO.hatchWord();
      if (w) { log('A WORD IS CRACKING'); ERO.debris.hatch(w, performance.now(), come); }
      else come(env.W / 2, env.view.top + 120);
      start();
    });
  }

  let nextWild = 0;
  function wildHatch(now) {
    if (!nextWild) nextWild = now + WILD_MS[0] * 0.5;
    if (now < nextWild || ERO.debris.hatching || all.length >= WILD_MAX) return;
    if (!all.some((c) => c.alive)) return;
    nextWild = now + WILD_MS[0] + Math.random() * (WILD_MS[1] - WILD_MS[0]);
    hatchMutant(now, true);
  }

  // A mutant cracks out of a word on screen. Now and then it is the first
  // form of the squid line instead, which only ever turns up this way.
  const SQUID_SHARE = 0.2;
  function hatchMutant(now, wild) {
    const w = ERO.hatchWord();
    if (!w) return false;
    log('A WORD IS CRACKING');
    const squid = wild && Math.random() < SQUID_SHARE;
    ERO.debris.hatch(w, now, (x, y) => {
      const m = squid ? summonAt(x, y, 'squid', null, 1) : spawnMutant(x, y);
      if (m && squid) log(tag(m) + ' APPEARED');
      if (m && pendingSelect) { select(m); pendingSelect = false; }
    });
    start();
    return true;
  }
  let pendingSelect = false;

  // ---- Travellers -------------------------------------------------------------
  const pageName = (path) => (path || '').split('/').filter(Boolean).pop().replace(/\.html$/, '').toUpperCase() || 'NOWHERE';
  function letIn() {
    if (!ERO.travel.on) return;
    ERO.travel.arrivals().forEach((t, i) => setTimeout(() => arrive(t), 900 + i * 1400));
  }
  function arrive(t) {
    const come = (x, y) => {
      if (all.length >= MAX_POP) return;
      const c = ERO.travel.make(svg, t);
      if (!c) return;
      attach(c);
      c.setHome(x, y, env.scale);
      c.arrive(x, y, t);
      all.push(c);
      seen.set(c, { name: c.name, alive: c.alive, gone: c.gone, fond: c.fondOn });
      log(tag(c) + ' CAME IN FROM ' + pageName(t.from));
      start();
    };
    if (all.length >= MAX_POP) return;
    const door = t.from ? ERO.words.exitTo(t.from) : null;
    if (door && door.y + door.h > env.view.top && door.y < env.view.bottom) {
      door.el.classList.add('ero-portal');
      setTimeout(() => door.el.classList.remove('ero-portal'), 900);
      come(door.x + door.w / 2, door.y + door.h * 0.55);
      return;
    }
    const w = ERO.hatchWord();
    if (w) ERO.debris.hatch(w, performance.now(), come);
    else come(env.W / 2, env.view.top + 80);
    start();
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    // (sub.js may already have taken over the click to glitch out first: fine)
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || !ERO.travel.on) return;
    ERO.travel.follow(all, a.href);
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) letIn(); });

  function removeDead() {
    for (let i = all.length - 1; i >= 0; i--) {
      const c = all[i];
      if (!c.mutant || !c.removed) continue;
      if (c.left) log(tag(c) + ' SLIPPED INTO A LINK');
      if (env.dragged === c) env.dragged = null;
      if (selected === c) select(creatures.crawler);
      c.destroy();
      seen.delete(c);
      tags.delete(c);
      all.splice(i, 1);
    }
  }

  function wake(c, fromButton) {
    // Woken from a button while far away: drop it just off the edge of the
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
    ERO.travel.clear();
    nextWild = 0;
    all.forEach((c) => seen.set(c, { name: c.name, alive: c.alive, gone: c.gone, fond: false }));
    log('PURGE. THE PAGE IS HEALED');
    start();
  }

  document.getElementById('purge').addEventListener('click', purge);
  document.getElementById('release').addEventListener('click', () => {
    all.forEach((c) => { if (!c.alive && !c.gone) wake(c, true); });
    start();
  });

  // ---- Lab: skip ahead on the selected creature ------------------------------
  const lab = {
    evolve: document.getElementById('lab-evolve'),
    split: document.getElementById('lab-split'),
    kill: document.getElementById('lab-kill'),
    mutant: document.getElementById('lab-mutant')
  };
  lab.evolve.addEventListener('click', () => { selected.evolve(); start(); });
  lab.split.addEventListener('click', () => { selected.split(); start(); });
  lab.kill.addEventListener('click', () => { selected.kill(); start(); });
  lab.mutant.addEventListener('click', () => {
    if (all.length >= MAX_POP) { log('THE PAGE IS FULL'); return; }
    if (ERO.debris.hatching) return;
    pendingSelect = true;
    hatchMutant(performance.now());
  });

  // ---- Panels ----------------------------------------------------------------
  const sel = {
    name: document.getElementById('sel-name'),
    mood: document.getElementById('sel-mood'),
    soon: document.getElementById('sel-soon'),
    form: document.getElementById('sel-form'),
    foodLabel: document.getElementById('sel-food-label'),
    food: document.getElementById('sel-food'),
    fond: document.getElementById('sel-fond'),
    fondText: document.getElementById('sel-fond-text'),
    pieces: document.getElementById('sel-pieces')
  };
  const SQUARES = 15;
  for (let i = 0; i < SQUARES; i++) sel.food.append(document.createElement('span'));
  let shownSel = '';

  function updateSelected() {
    const c = selected;
    const p = c.progress();
    const pupa = !c.gone && c.name === 'PUPA';
    const fond = Math.round(c.fond * 100);
    const pieces = ERO.debris.count || 0;
    const key = [c.name, c.mood, c.stage, p.eaten, p.at, fond, pieces, c.gone, c.canGrow, c.canSplit].join('|');
    if (key === shownSel) return;
    shownSel = key;

    sel.name.textContent = c.gone ? 'REMAINS' : tag(c);
    sel.mood.textContent = c.mood;
    sel.form.textContent = c.gone ? 'GONE' : pupa ? 'STILL / STAGE ' + c.stage + ' OF ' + c.stages : 'STAGE ' + c.stage + ' OF ' + c.stages;

    const left = p.at - p.eaten;
    const soon = p.next && left <= Math.max(3, p.at * 0.2);
    sel.soon.hidden = !soon;
    if (soon) sel.soon.textContent = '→ ' + (p.next === 'PUPA' ? 'CHANGE SOON' : p.next === 'FULL' ? 'FULL SIZE SOON' : 'SPLIT SOON');

    sel.foodLabel.textContent = p.at
      ? 'WORDS ' + Math.min(p.eaten, p.at) + ' OF ' + p.at + (p.next === 'SPLIT' ? ' TO SPLIT' : p.next === 'FULL' ? ' TO FULL SIZE' : ' TO CHANGE')
      : pupa ? 'WORDS / RESTING' : 'WORDS / NONE';
    const on = p.at ? Math.round(Math.min(1, p.eaten / p.at) * SQUARES) : 0;
    [...sel.food.children].forEach((s, i) => s.classList.toggle('on', i < on));

    sel.fond.style.width = fond + '%';
    sel.fondText.textContent = fond + '%' + (c.fondOn ? ' / FOLLOWING YOU' : '');
    sel.pieces.textContent = pieces + (pieces === 1 ? ' PIECE' : ' PIECES') + ' LEFT';

    // (a snake has one stage: NEXT STAGE grows it to full size instead)
    lab.evolve.disabled = !c.canGrow;
    lab.split.disabled = !c.canSplit;
    lab.kill.disabled = c.gone;
  }

  function updateUI() {
    for (const c of all) watch(c);
    for (const [c, u] of ui) {
      const text = c.name + ' ' + c.mood + ' / ' + c.label();
      if (text === u.text) continue;
      u.text = text;
      u.names.forEach((el) => { el.textContent = tag(c); });
      u.state.textContent = c.mood;
      u.label.textContent = c.mood;
      u.btn.setAttribute('aria-pressed', String(c.alive));
    }
    const n = ERO.words.swallowed;
    const pop = all.filter((c) => !c.gone).length;
    const key = n + '/' + pop;
    if (key !== shownCount) {
      shownCount = key;
      countEl.textContent = String(pop).padStart(2, '0') + ' PRESENT / ' + n + (n === 1 ? ' WORD' : ' WORDS') + ' MISSING';
    }
    updateSelected();
  }

  // ---- Pointer and view ----------------------------------------------------
  function setPointer(e) {
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
    env.view.top = Math.max(0, -r.top);
    env.view.bottom = -r.top + window.innerHeight;
    env.ptr.x = client.x - r.left;
    env.ptr.y = client.y - r.top;
    env.ptr.on = client.known;
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
    ERO.debris.draw(performance.now()); // strands hang off words, which may have moved
  }

  // ---- Loop ----------------------------------------------------------------
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
  ERO.start = start;

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
    // A creature you hold, or one clinging to the cursor, sits exactly under
    // the pointer right before drawing (no lag).
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

  // ---- Header: INTERCEPT glitches out to the 404 page -----------------------
  const intercept = document.querySelector('.ero-intercept');
  intercept.addEventListener('click', () => {
    intercept.textContent = 'INTERCEPT';
    intercept.classList.add('is-active');
    if (reduceMotion.matches) { location.href = '../../404.html'; return; }
    try { sessionStorage.setItem('glitch-arrive', '1'); } catch (_) { /* storage blocked: no glitch-in */ }
    document.body.classList.add('glitch-out');
    setTimeout(() => { location.href = '../../404.html'; }, 550);
  });

  // ---- Events --------------------------------------------------------------
  window.addEventListener('pointermove', setPointer);
  document.documentElement.addEventListener('pointerleave', () => { client.known = false; env.ptr.on = false; });
  window.addEventListener('pointerup', (e) => {
    if (env.dragged) {
      const still = performance.now() - client.t > 80;
      env.dragged.fling(still ? 0 : env.ptr.vx * 1.3, still ? 0 : env.ptr.vy * 1.3);
      env.dragged = null;
    }
    if (e.pointerType !== 'mouse') client.known = false;
  });
  window.addEventListener('pointercancel', () => { env.dragged = null; client.known = false; });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && all.some((c) => c.alive || !c.settled())) start();
  });
  new ResizeObserver(layout).observe(world);
  // Measure again once the glitch-in (which shakes the page) has finished.
  setTimeout(layout, 800);
  if (document.fonts) document.fonts.ready.then(layout);

  ERO.feeding(world, env);
  layout();
  all.forEach((c) => seen.set(c, { name: c.name, alive: c.alive, gone: c.gone, fond: false }));
  log('ARCHIVE OPENED / 03 DORMANT');
  updateUI();
  letIn();
})();
