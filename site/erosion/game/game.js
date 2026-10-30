/* Walk to the door. Every step forward brings you closer, and every time you
   get close the door moves further away (its old places stay behind as
   faint outlines). The steps of everyone in this browser add up.
   (There is a way to reach it. The door is shy, not unkind.) */
(() => {
  'use strict';
  const TICK = 57;            // px between ruler marks (viewBox units)
  const COUNT = 31;           // marks on the ruler
  const KEY = 'ero-door-steps';
  const $ = (id) => document.getElementById(id);
  const ground = $('game-ground'), ghosts = $('game-ghosts'), door = $('game-door'), man = $('game-man');
  const legs = $('game-legs'), arms = $('game-arms');
  const countEl = $('game-count'), awayEl = $('game-away'), wasEl = $('game-was'), goalEl = $('game-goal');
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let steps = 4113;
  try { steps = Math.max(steps, parseInt(localStorage.getItem(KEY) || '0', 10) || 0); } catch (_) { /* storage blocked */ }
  let me = 3, doorAt = 15, was = 11, phase = 0, done = false;
  const old = [];  // where the door used to be

  for (let i = 0; i < COUNT; i++) {
    const l = document.createElementNS(NS, 'line');
    const x = 60 + i * TICK;
    l.setAttribute('x1', x); l.setAttribute('x2', x);
    l.setAttribute('y1', 190); l.setAttribute('y2', i % 5 === 1 ? 214 : 202);
    ground.append(l);
  }
  const base = document.createElementNS(NS, 'line');
  base.setAttribute('x1', 0); base.setAttribute('x2', 1760); base.setAttribute('y1', 190); base.setAttribute('y2', 190);
  ground.append(base);

  const xOf = (t) => 60 + t * TICK;

  function draw() {
    man.setAttribute('transform', 'translate(' + xOf(me) + ' 0)');
    door.setAttribute('transform', 'translate(' + (xOf(doorAt) - 39) + ' 0)');
    const s = phase % 2 ? 1 : -1;
    legs.setAttribute('points', (-25 * s) + ',190 0,130 ' + (26 * s) + ',190');
    arms.setAttribute('points', '-34,' + (110 - s * 6) + ' 0,80 36,' + (100 + s * 6));
    ghosts.textContent = '';
    old.forEach((t, i) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', xOf(t) - 39); r.setAttribute('y', 40); r.setAttribute('width', 78); r.setAttribute('height', 150);
      r.setAttribute('opacity', (0.12 + 0.5 * (i + 1) / old.length).toFixed(2));
      ghosts.append(r);
    });
    countEl.textContent = steps;
    awayEl.textContent = Math.max(0, doorAt - me);
    wasEl.textContent = was;
  }

  function save() { try { localStorage.setItem(KEY, String(steps)); } catch (_) { /* storage blocked */ } }

  function forward() {
    if (done) return;
    me++; steps++; phase++;
    if (doorAt - me <= 1) {
      // Too close: the door moves on, and leaves its outline behind.
      was = doorAt - me + 1;
      old.push(doorAt);
      if (old.length > 9) old.shift();
      doorAt += 3 + Math.floor(Math.random() * 4);
    }
    // Running out of ruler: everything slides back, the walk goes on.
    if (doorAt > COUNT - 3) {
      const k = doorAt - (COUNT - 6);
      me -= k; doorAt -= k;
      for (let i = 0; i < old.length; i++) old[i] -= k;
      while (old.length && old[0] < 0) old.shift();
      if (me < 0) me = 0;
    }
    save(); draw();
  }

  // Walking away: the door follows you, a little.
  function back() {
    if (done) return;
    if (me > 0) me--;
    steps++; phase++;
    doorAt -= Math.random() < 0.6 ? 2 : 1;
    if (doorAt - me <= 0) return arrive();
    save(); draw();
  }

  function arrive() {
    done = true;
    doorAt = me;
    door.classList.add('is-open');
    goalEl.textContent = 'GOAL: THE DOOR CAME TO YOU';
    save(); draw();
    setTimeout(() => {
      if (!reduce) {
        try { sessionStorage.setItem('glitch-arrive', '1'); } catch (_) { /* storage blocked */ }
        document.body.classList.add('glitch-out');
      }
      setTimeout(() => { location.href = '../loop/index.html'; }, reduce ? 0 : 550);
    }, 1400);
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  });
  $('game-step').addEventListener('click', forward);
  $('game-back').addEventListener('click', back);
  draw();
})();
