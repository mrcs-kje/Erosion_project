/*
  Erosion.exe crawlers on any page: the loop, the pointer and the eggs.

  A page that wants creatures needs:
  - a positioned <main id="world"> with <svg id="figure"> inside it,
  - data-ero-food on the elements whose words the creatures may eat,
  - optional: data-eggs="N" on #world (how many words tremble and can be
    clicked to hatch something; default a random 3 to 5), <span data-egg>word</span> for
    a word that is always an egg, data-no-eggs on a part where no random
    egg may appear (for example behind a pop-up), and elements with data-home="crawler"
    (or snake, strider) where that creature sleeps until you tap it,
  - optional: a button with id="purge".
  Load after words.js and creatures.js.

  EGGS: a word that looks like any other, except for a small twitch every
  few seconds (and it turns red under the cursor). Click it and it cracks open, and a small creature crawls out of
  its letters: mostly a glyph crawler (RIBS, BRACE or QUILL, from crawl_33,
  38 and 39), sometimes the first form of another line. A new egg appears
  somewhere else a good while later.
  DAMAGE: double-click (or double-tap) a creature. Single press: wake it,
  or catch it and throw it.
  FEEDING (demo 13): hold a word to pull it out of the text, then let go on
  a creature (it eats from your hand) or anywhere (it lies there as food).
  HATCH LIMIT: data-hatch-max="N" on #world: at most N creatures hatch on
  this page per visit (eggs and wild hatchings together). After that no
  more eggs appear. Creatures that follow you in still come.
  TRAVEL: every link in #world to another page is an exit. A wild creature
  now and then slips through one, and creatures that are fond of you follow
  you when you click a link (anywhere on the page). Creatures that went to
  this page come in when it opens: out of the link back to where they came
  from if it is on screen, otherwise out of a word. PURGE forgets them all.
*/
(() => {
  'use strict';

  const ERO = window.ERO;
  const STEP = 1000 / 60;
  const MAX_POP = 9;
  const EGG_MS = [6000, 14000];  // a new egg after a hatch
  const GLYPH_SHARE = 0.7;       // share of new creatures that are glyph crawlers
  const WILD_MS = [50000, 90000];

  const world = document.getElementById('world');
  const svg = document.getElementById('figure');
  if (!world || !svg) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  document.querySelectorAll('[data-ero-food]').forEach((el) => ERO.words.wrap(el));
  // Links with no words to walk into (drawings, drawn doors) are exits too.
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
  const all = [];
  env.creatures = all;
  ERO.all = all;

  const makers = { crawler: ERO.makeCrawler, snake: ERO.makeSnake, strider: ERO.makeStrider, siphon: ERO.makeSiphon, squid: ERO.makeSquid };
  let running = false, last = 0, acc = 0;

  // ---- Creatures that live on this page (they sleep in their cell) ---------
  const homes = new Map();
  document.querySelectorAll('[data-home]').forEach((cell) => {
    const make = makers[cell.dataset.home];
    if (!make) return;
    const c = make(svg);
    homes.set(c, { cell, label: cell.querySelector('.ero-state') || cell.parentElement.querySelector('.ero-state'), text: '' });
    all.push(c);
    attach(c);
  });

  // Tap: wake it. Press on an awake one: catch it. Press twice: damage.
  const tap = { c: null, t: 0, x: 0, y: 0 };
  function attach(c) {
    c.hits.forEach((hit) => {
      hit.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        setPointer(e);
        const t = performance.now();
        if (c.alive && tap.c === c && t - tap.t < 350 && Math.hypot(env.ptr.x - tap.x, env.ptr.y - tap.y) < 40) {
          tap.c = null;
          ERO.zap(c, { x: env.ptr.x, y: env.ptr.y }, t);
          start();
          return;
        }
        Object.assign(tap, { c, t, x: env.ptr.x, y: env.ptr.y });
        if (!c.alive) {
          c.wake();
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

  // A small creature crawls out at (x, y): usually a glyph crawler ("mutant"
  // in the code), otherwise a first form of another line. The squid line
  // only ever comes this way (a random hatching), never from a nest.
  function spawn(x, y, kind) {
    if (all.length >= MAX_POP) return null;
    const lines = ['crawler', 'snake', 'strider', 'siphon', 'squid'];
    kind = kind || (Math.random() < GLYPH_SHARE ? 'mutant' : lines[Math.floor(Math.random() * lines.length)]);
    const c = kind === 'mutant' ? ERO.makeMutant(svg) : makers[kind](svg, { mutant: true });
    attach(c);
    c.setHome(x, y, env.scale);
    c.bornAt(x, y);
    all.push(c);
    start();
    return c;
  }
  ERO.spawnMutant = (x, y) => spawn(x, y);
  // A snake egg hatching (demo 14), and how many more creatures fit.
  ERO.hatchLine = (x, y, line) => spawn(x, y, line);
  ERO.room = () => MAX_POP - all.length;
  // A splitting fifth form leaves two small ones: a colony sheds polyps.
  ERO.onSplit = (parent, x, y) => {
    const kind = parent.line === 'siphon' || parent.line === 'squid' ? parent.line : null; // a kraken bursts into specks
    spawn(x - 30, y, kind);
    spawn(x + 30, y, kind);
  };
  ERO.hatchWord = () => ERO.words.random(env.view.top + 40, env.view.bottom - 40);

  // ---- Eggs ------------------------------------------------------------------
  const eggCount = Math.max(0, world.dataset.eggs ? parseInt(world.dataset.eggs, 10) : 3 + Math.floor(Math.random() * 3));
  const eggs = new Set();
  let nextEgg = 0;
  const hatchMax = world.dataset.hatchMax ? parseInt(world.dataset.hatchMax, 10) : Infinity;
  let hatches = 0;
  const spent = () => hatches >= hatchMax;

  // Words that can be eggs: not in a link, long enough, not eaten.
  // (and not a word you can't see, such as hidden or see-through text)
  const visible = (w) => !/^rgba\(.*,\s*0\)$/.test(getComputedStyle(w.el).color);
  const canBeEgg = (w) => !w.gone && !w.link && w.len >= 4 && !w.el.closest('a, button, label, [data-no-eggs]') && !eggs.has(w) && visible(w);

  function makeEgg(w) {
    eggs.add(w);
    w.el.classList.add('ero-egg');
    // Each egg twitches on its own slow beat, so they never move together.
    w.el.style.setProperty('--ero-egg-ms', (3 + Math.random() * 3).toFixed(1) + 's');
    w.el.style.setProperty('--ero-egg-delay', (-Math.random() * 6).toFixed(1) + 's');
    w.el.setAttribute('role', 'button');
    w.el.setAttribute('tabindex', '0');
    w.el.setAttribute('aria-label', 'Trembling word: ' + w.text + '. Something is about to hatch.');
  }

  function crackEgg(w) {
    if (!eggs.has(w) || w.gone) return;
    eggs.delete(w);
    w.el.classList.remove('ero-egg');
    w.el.style.removeProperty('--ero-egg-ms');
    w.el.style.removeProperty('--ero-egg-delay');
    w.el.removeAttribute('role');
    w.el.removeAttribute('tabindex');
    w.el.removeAttribute('aria-label');
    if (all.length >= MAX_POP) { w.el.classList.add('ero-portal'); setTimeout(() => w.el.classList.remove('ero-portal'), 900); return; }
    const now = performance.now();
    ERO.debris.hatch(w, now, (x, y) => spawn(x, y));
    hatches++;
    if (spent()) clearEggs();
    nextEgg = now + EGG_MS[0] + Math.random() * (EGG_MS[1] - EGG_MS[0]);
    start();
  }

  // An egg a creature swallowed is gone: nothing will hatch from it.
  function dropEatenEggs() {
    for (const w of eggs) {
      if (!w.gone) continue;
      eggs.delete(w);
      w.el.classList.remove('ero-egg');
      w.el.removeAttribute('role');
      w.el.removeAttribute('tabindex');
      w.el.removeAttribute('aria-label');
      if (!nextEgg || nextEgg < performance.now()) nextEgg = performance.now() + EGG_MS[0];
    }
  }

  // The page has had all the hatchings it allows: the other eggs go still.
  function clearEggs() {
    eggs.forEach((w) => {
      w.el.classList.remove('ero-egg');
      w.el.removeAttribute('role');
      w.el.removeAttribute('tabindex');
      w.el.removeAttribute('aria-label');
    });
    eggs.clear();
  }

  function topUpEggs(now) {
    if (spent() || eggs.size >= eggCount || now < nextEgg) return;
    const pool = ERO.words.list.filter(canBeEgg);
    if (!pool.length) return;
    makeEgg(pool[Math.floor(Math.random() * pool.length)]);
    nextEgg = now + 400;
  }

  // Fill up to eggCount at once (words marked by hand come first).
  function fillEggs(marked) {
    if (marked) ERO.words.list.forEach((w) => { if (w.el.closest('[data-egg]') && !w.gone) makeEgg(w); });
    if (spent()) return;
    const pool = ERO.words.list.filter(canBeEgg).sort(() => Math.random() - 0.5);
    while (eggs.size < eggCount && pool.length) makeEgg(pool.pop());
  }
  fillEggs(true);

  world.addEventListener('click', (e) => {
    const el = e.target.closest('.ero-egg');
    if (!el) return;
    for (const w of eggs) if (w.el === el) { crackEgg(w); break; }
  });
  world.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest && e.target.closest('.ero-egg');
    if (!el) return;
    e.preventDefault();
    for (const w of eggs) if (w.el === el) { crackEgg(w); break; }
  });

  // Now and then something hatches by itself, while something is awake.
  let nextWild = 0;
  function wildHatch(now) {
    if (!nextWild) nextWild = now + WILD_MS[0];
    if (spent() || now < nextWild || ERO.debris.hatching || all.length >= MAX_POP - 2) return;
    if (!all.some((c) => c.alive)) return;
    nextWild = now + WILD_MS[0] + Math.random() * (WILD_MS[1] - WILD_MS[0]);
    const w = ERO.hatchWord();
    if (w) { ERO.debris.hatch(w, now, (x, y) => spawn(x, y)); hatches++; }
  }

  // ---- Travellers -------------------------------------------------------------
  // Let in everyone who went to this page, one after another.
  function letIn() {
    if (!ERO.travel.on) return;
    ERO.travel.arrivals().forEach((t, i) => setTimeout(() => arrive(t), 900 + i * 1400));
  }
  function arrive(t) {
    if (all.length >= MAX_POP) return;
    const come = (x, y) => {
      if (all.length >= MAX_POP) return;
      const c = ERO.travel.make(svg, t);
      if (!c) return;
      attach(c);
      c.setHome(x, y, env.scale);
      c.arrive(x, y, t);
      all.push(c);
      start();
    };
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

  // Clicking a link: the creatures that are fond of you come along.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    // (sub.js may already have taken over the click to glitch out first: fine)
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || !ERO.travel.on) return;
    ERO.travel.follow(all, a.href);
  });
  // Back to this page from the browser's memory (back button): let in anyone new.
  window.addEventListener('pageshow', (e) => { if (e.persisted) letIn(); });

  function removeDead() {
    for (let i = all.length - 1; i >= 0; i--) {
      const c = all[i];
      if (!c.mutant || !c.removed) continue;
      if (env.dragged === c) env.dragged = null;
      c.destroy();
      all.splice(i, 1);
    }
  }

  // ---- Purge -----------------------------------------------------------------
  function purge() {
    env.dragged = null;
    all.forEach((c) => {
      if (c.mutant) c.removed = true;
      else { c.sleep(); c.reset(); }
    });
    removeDead();
    eggs.forEach((w) => w.el.classList.remove('ero-egg'));
    eggs.clear();
    ERO.words.reset();
    ERO.debris.clearDrops();
    ERO.travel.clear();
    nextEgg = 0;
    nextWild = 0;
    hatches = 0;
    fillEggs(true);
    start();
  }
  const purgeBtn = document.getElementById('purge');
  if (purgeBtn) purgeBtn.addEventListener('click', purge);
  ERO.purge = purge;

  function updateLabels() {
    for (const [c, u] of homes) {
      if (!u.label) continue;
      const text = c.mood;
      if (text === u.text) continue;
      u.text = text;
      u.label.textContent = text;
    }
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
    for (const [c, u] of homes) {
      const r = u.cell.getBoundingClientRect();
      c.setHome(r.left - o.left + r.width / 2, r.top - o.top + r.height * 0.5, env.scale);
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
    updateLabels();
    dropEatenEggs();
    topUpEggs(now);
    if (ERO.debris.active || all.some((c) => c.alive || !c.settled()) || (eggs.size < eggCount && nextEgg > now - 500)) {
      requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  // ---- Header: INTERCEPT glitches out to the 404 page -----------------------
  const intercept = document.querySelector('.ero-intercept');
  if (intercept) {
    intercept.addEventListener('click', () => {
      const to = intercept.dataset.to || '../../404.html';
      intercept.textContent = 'INTERCEPT';
      intercept.classList.add('is-active');
      if (reduceMotion.matches) { location.href = to; return; }
      try { sessionStorage.setItem('glitch-arrive', '1'); } catch (_) { /* storage blocked: no glitch-in */ }
      document.body.classList.add('glitch-out');
      setTimeout(() => { location.href = to; }, 550);
    });
  }

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
  setTimeout(layout, 800); // again once the glitch-in has finished shaking the page
  if (document.fonts) document.fonts.ready.then(layout);

  // Words added to the page later (for example a line a visitor wrote).
  ERO.feed = (el) => { ERO.words.wrap(el); layout(); };

  ERO.feeding(world, env);

  layout();
  updateLabels();
  letIn();
})();
