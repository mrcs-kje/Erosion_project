/*
  EROSION.EXE demo 01: the tappable figure.

  How it works (read this first if you are new to the code):
  - The figure is a set of NODES (the dots) joined by EDGES (the lines).
  - Each edge remembers its resting length. Every tick we nudge the dots so
    the edges go back to that length. That is the whole "creature" trick:
    pull one dot and the rest drag along behind it.
  - SHAPE pulls every dot gently toward its place in the original pose, so
    the figure stays recognisable instead of collapsing into a tangle.
  - The loop only runs while the creature is awake or settling back to sleep.
    A sleeping figure costs nothing.
*/
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  // Rest pose, drawn in a 360 x 580 box. Edit these to redesign the figure.
  const NODES = [
    [140, 12],  // 0 head top
    [88, 108],  // 1 head left
    [180, 140], // 2 chin
    [192, 76],  // 3 head right
    [124, 168], // 4 neck
    [108, 262], // 5 hip
    [112, 330], // 6 belly
    [190, 222], // 7 elbow
    [258, 190], // 8 hand
    [330, 215], // 9 fingertip
    [30, 520],  // 10 foot (eroded)
    [132, 540]  // 11 foot (eroded)
  ];
  const ERODED = new Set([10, 11]);

  const LIMBS = [
    [0, 1], [1, 2], [2, 3], [3, 0], [0, 4],
    [4, 5], [5, 6], [5, 7], [7, 8], [8, 9],
    [6, 9], [5, 10], [6, 11]
  ];
  // Invisible stiffeners so the head keeps its shape.
  const BRACES = [[0, 2], [1, 3], [1, 4]];

  const DESIGN_W = 360;
  const DESIGN_H = 580;

  // Tuning
  const STEP = 1000 / 60;   // fixed simulation step in ms
  const DAMPING = 0.94;
  const SHAPE = 0.012;      // how strongly dots return to the original pose
  const LEAD_SPEED = 2.6;   // max px per step the lead dot is pulled
  const ITERATIONS = 8;     // constraint passes per step

  const stage = document.getElementById('stage');
  const svg = document.getElementById('figure');
  const statusEl = document.getElementById('status');
  const purgeBtn = document.getElementById('purge');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const n = NODES.length;
  const pos = NODES.map(() => ({ x: 0, y: 0 }));
  const prev = NODES.map(() => ({ x: 0, y: 0 }));
  const rest = NODES.map(() => ({ x: 0, y: 0 }));
  const edges = LIMBS.concat(BRACES).map(([a, b]) => ({ a, b, len: 0 }));
  const visibleCount = LIMBS.length;

  let W = 0, H = 0, scale = 1;
  let alive = false;
  let lead = -1;
  let dragging = false;
  const target = { x: 0, y: 0 };
  let nextPick = 0;
  let running = false;
  let last = 0;
  let acc = 0;

  // ---- Build the SVG -------------------------------------------------------
  const lineEls = [];
  const dotEls = [];

  LIMBS.forEach(([a, b]) => {
    const el = document.createElementNS(NS, 'line');
    el.setAttribute('class', 'limb' + (ERODED.has(a) || ERODED.has(b) ? ' eroded' : ''));
    svg.appendChild(el);
    lineEls.push(el);
  });

  NODES.forEach((_, i) => {
    const hit = document.createElementNS(NS, 'circle');
    hit.setAttribute('class', 'hit');
    hit.setAttribute('r', '22'); // big invisible tap area for fingers
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', 'Dot ' + (i + 1) + '. Wake the figure from here.');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('class', 'dot' + (ERODED.has(i) ? ' eroded' : ''));
    dot.setAttribute('r', '3.6');
    svg.appendChild(hit);
    svg.appendChild(dot);
    dotEls.push({ hit, dot });

    hit.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      wake(i);
      dragging = true;
      svg.setPointerCapture(e.pointerId);
      setTargetFromEvent(e);
    });
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        wake(i);
      }
    });
  });

  // ---- Layout --------------------------------------------------------------
  function layout() {
    const r = stage.getBoundingClientRect();
    W = Math.max(200, r.width);
    H = Math.max(200, r.height);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    scale = Math.min((W - 40) / DESIGN_W, (H - 40) / DESIGN_H, 1.2);
    const ox = Math.max(0, Math.min(24, (W - DESIGN_W * scale) / 2));
    const oy = (H - DESIGN_H * scale) / 2;

    NODES.forEach(([x, y], i) => {
      rest[i].x = ox + x * scale;
      rest[i].y = oy + y * scale;
    });
    edges.forEach((e) => {
      e.len = Math.hypot(rest[e.a].x - rest[e.b].x, rest[e.a].y - rest[e.b].y);
    });

    if (!alive) {
      for (let i = 0; i < n; i++) {
        pos[i].x = prev[i].x = rest[i].x;
        pos[i].y = prev[i].y = rest[i].y;
      }
    } else {
      clampAll();
    }
    draw();
  }

  // ---- Waking and sleeping -------------------------------------------------
  function wake(i) {
    lead = i;
    nextPick = 0;
    if (!alive) {
      alive = true;
      document.body.classList.add('alive');
      svg.classList.add('alive');
      statusEl.textContent = 'RUNNING';
    }
    start();
  }

  function purge() {
    alive = false;
    dragging = false;
    lead = -1;
    document.body.classList.remove('alive');
    svg.classList.remove('alive');
    statusEl.textContent = 'DORMANT';
    start(); // run until it has settled back into the rest pose
  }

  // ---- Wandering target ----------------------------------------------------
  function pickTarget(now) {
    const m = 40;
    target.x = m + Math.random() * (W - 2 * m);
    target.y = m + Math.random() * (H - 2 * m);
    nextPick = now + 2500 + Math.random() * 3000;
  }

  function setTargetFromEvent(e) {
    const r = svg.getBoundingClientRect();
    target.x = e.clientX - r.left;
    target.y = e.clientY - r.top;
  }

  // ---- Simulation ----------------------------------------------------------
  function step(now) {
    if (!alive) {
      // Ease every dot back to its sleeping place.
      for (let i = 0; i < n; i++) {
        pos[i].x += (rest[i].x - pos[i].x) * 0.09;
        pos[i].y += (rest[i].y - pos[i].y) * 0.09;
        prev[i].x = pos[i].x;
        prev[i].y = pos[i].y;
      }
      return;
    }

    const t = now / 1000;

    if (!dragging && !reduceMotion.matches) {
      const d = lead >= 0 ? Math.hypot(target.x - pos[lead].x, target.y - pos[lead].y) : 0;
      if (now > nextPick || d < 24) pickTarget(now);
    }

    // Move each dot by its own momentum.
    for (let i = 0; i < n; i++) {
      const vx = (pos[i].x - prev[i].x) * DAMPING;
      const vy = (pos[i].y - prev[i].y) * DAMPING;
      prev[i].x = pos[i].x;
      prev[i].y = pos[i].y;
      pos[i].x += vx;
      pos[i].y += vy;
    }

    // Shape memory: drift toward the rest pose, relative to the body's centre.
    let cx = 0, cy = 0, rx = 0, ry = 0;
    for (let i = 0; i < n; i++) {
      cx += pos[i].x; cy += pos[i].y;
      rx += rest[i].x; ry += rest[i].y;
    }
    cx /= n; cy /= n; rx /= n; ry /= n;
    for (let i = 0; i < n; i++) {
      pos[i].x += (cx + rest[i].x - rx - pos[i].x) * SHAPE;
      pos[i].y += (cy + rest[i].y - ry - pos[i].y) * SHAPE;
      // A little restlessness so the limbs never hang dead still.
      pos[i].x += Math.cos(t * 2.3 + i * 1.7) * 0.12;
      pos[i].y += Math.sin(t * 2.9 + i * 1.3) * 0.12;
    }

    // Pull the lead dot toward the target.
    if (lead >= 0) {
      const dx = target.x - pos[lead].x;
      const dy = target.y - pos[lead].y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = Math.min(d * 0.05, LEAD_SPEED);
      pos[lead].x += (dx / d) * pull;
      pos[lead].y += (dy / d) * pull;
    }

    // Keep every limb at its resting length.
    for (let k = 0; k < ITERATIONS; k++) {
      for (let j = 0; j < edges.length; j++) {
        const e = edges[j];
        const p = pos[e.a], q = pos[e.b];
        const dx = q.x - p.x, dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = (d - e.len) / d * 0.5;
        const lockA = e.a === lead ? 0.25 : 1;
        const lockB = e.b === lead ? 0.25 : 1;
        p.x += dx * diff * lockA; p.y += dy * diff * lockA;
        q.x -= dx * diff * lockB; q.y -= dy * diff * lockB;
      }
    }

    clampAll();
  }

  function clampAll() {
    const m = 10;
    for (let i = 0; i < n; i++) {
      pos[i].x = Math.min(W - m, Math.max(m, pos[i].x));
      pos[i].y = Math.min(H - m, Math.max(m, pos[i].y));
    }
  }

  function settled() {
    for (let i = 0; i < n; i++) {
      if (Math.abs(pos[i].x - rest[i].x) > 0.3 || Math.abs(pos[i].y - rest[i].y) > 0.3) return false;
    }
    return true;
  }

  // ---- Drawing -------------------------------------------------------------
  function draw() {
    for (let i = 0; i < visibleCount; i++) {
      const [a, b] = LIMBS[i];
      const el = lineEls[i];
      el.setAttribute('x1', pos[a].x.toFixed(1));
      el.setAttribute('y1', pos[a].y.toFixed(1));
      el.setAttribute('x2', pos[b].x.toFixed(1));
      el.setAttribute('y2', pos[b].y.toFixed(1));
    }
    for (let i = 0; i < n; i++) {
      const x = pos[i].x.toFixed(1), y = pos[i].y.toFixed(1);
      dotEls[i].hit.setAttribute('cx', x);
      dotEls[i].hit.setAttribute('cy', y);
      dotEls[i].dot.setAttribute('cx', x);
      dotEls[i].dot.setAttribute('cy', y);
    }
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
    acc += Math.min(now - last, 100);
    last = now;
    while (acc >= STEP) { step(now); acc -= STEP; }
    draw();
    if (alive || !settled()) {
      requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  // ---- Events --------------------------------------------------------------
  svg.addEventListener('pointermove', (e) => { if (dragging) setTargetFromEvent(e); });
  svg.addEventListener('pointerup', () => { dragging = false; nextPick = 0; });
  svg.addEventListener('pointercancel', () => { dragging = false; });
  purgeBtn.addEventListener('click', purge);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (alive || !settled())) start(); });
  new ResizeObserver(layout).observe(stage);

  layout();
})();
