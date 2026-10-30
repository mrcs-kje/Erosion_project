/*
  EROSION.EXE spider test 01: the word spider.

  How it works (read this first if you are new to the code):
  - The BODY is a set of dots joined by lines. Each tick every body dot is
    pulled toward where it "should" be (the body's centre + heading), but it
    keeps its own momentum, so the body wobbles and lags like soft tissue.
  - The body steers itself: a slow random wander, a push away from the
    walls, and a strong push away from your cursor (it is shy).
  - The LEGS are not physics. Each foot is planted on a spot and stays there
    (gripping) until the body has moved too far from it. Then it lifts and
    steps to a new spot ahead of the body, preferring to land on a WORD.
    Neighbouring legs wait for each other, which gives the spider gait.
  - Every leg is two lines; the knee is worked out with simple trigonometry
    (inverse kinematics) so the leg always reaches from hip to foot.
  - Every few words it grips, it sprouts another pair of legs (up to 10).
  - The loop only runs while it is awake or settling back to sleep.
*/
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  // Body pose in local units: +x points forward (the head), +y is its right.
  const BODY = [
    [24, 0],    // 0 head tip
    [15, -7],   // 1 head left
    [15, 7],    // 2 head right
    [4, -10],   // 3 front left
    [4, 10],    // 4 front right
    [-7, -11],  // 5 waist left
    [-7, 11],   // 6 waist right
    [-20, -13], // 7 belly left
    [-20, 13],  // 8 belly right
    [-36, -9],  // 9 rear left
    [-36, 9],   // 10 rear right
    [-44, 0]    // 11 tail
  ];
  const BODY_LINES = [
    [0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 6],
    [5, 7], [6, 8], [7, 9], [8, 10], [9, 11], [10, 11]
  ];
  // Invisible stiffeners so the body keeps its shape.
  const BRACES = [[0, 3], [0, 4], [3, 4], [3, 6], [4, 5], [5, 8], [6, 7], [7, 8], [7, 10], [8, 9], [7, 11], [8, 11]];

  // Leg sockets, front to back: [left hip dot, right hip dot, splay angle from forward].
  const SLOTS = [
    [1, 2, 38],
    [3, 4, 72],
    [5, 6, 104],
    [7, 8, 130],
    [9, 10, 152]
  ];
  const GROW_ORDER = [1, 2, 0, 3, 4]; // which pair sprouts next
  const START_PAIRS = 2;
  const GRIPS_PER_PAIR = 5;           // words gripped before a new pair grows

  const WORDS = [
    'rust', 'signal', 'static', 'bone', 'echo', 'thread', 'drift', 'marrow', 'glitch', 'spore',
    'hollow', 'nerve', 'residue', 'salt', 'murmur', 'fracture', 'lichen', 'wire', 'dust', 'orbit',
    'quiet', 'pulse', 'membrane', 'fault', 'silt', 'wander', 'feral', 'tether', 'decay', 'bloom',
    'ghost', 'noise', 'crawl', 'seam', 'fold', 'ember', 'moth', 'node', 'limb', 'loop',
    'shard', 'veil', 'grain', 'hum', 'tide', 'fever', 'cinder', 'crack', 'linger', 'husk',
    'vapor', 'ferment', 'index', 'error', 'null', 'void', 'draft', 'sketch', 'untitled', 'v2_final',
    'proof', 'stain', 'scrap', 'hinge', 'knot', 'swarm', 'mould', 'brine', 'flicker', 'hatch',
    'rot', 'sprawl', 'scar', 'pollen', 'mirror', 'tremor', 'larva', 'grief', 'soft', 'feed'
  ];

  // Tuning
  const STEP = 1000 / 60;   // fixed simulation step in ms
  const DAMPING = 0.86;     // body dot momentum
  const BODY_SPRING = 0.2;  // how hard body dots chase their place
  const ITERATIONS = 3;     // constraint passes per step
  const CRUISE = 1.1;       // calm walking speed, px per step
  const FLEE_SPEED = 5;     // panicked speed
  const FLEE_RADIUS = 190;  // how close the cursor can get before it bolts
  const REACH = 58;         // resting leg reach
  const SEG = REACH * 0.76; // length of each leg segment (thigh and shin)
  const LEAD = 14;          // how far ahead (in steps of velocity) feet aim

  const stage = document.getElementById('stage');
  const svg = document.getElementById('figure');
  const statusEl = document.getElementById('status');
  const metaEl = document.getElementById('meta');
  const purgeBtn = document.getElementById('purge');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const n = BODY.length;
  const pos = BODY.map(() => ({ x: 0, y: 0 }));
  const prev = BODY.map(() => ({ x: 0, y: 0 }));
  const edges = BODY_LINES.concat(BRACES).map(([a, b]) => ({
    a, b, len: Math.hypot(BODY[a][0] - BODY[b][0], BODY[a][1] - BODY[b][1])
  }));

  let W = 0, H = 0, scale = 1;
  const B = { x: 0, y: 0 };      // body centre
  const V = { x: 0, y: 0 };      // body velocity
  const home = { x: 0, y: 0 };   // where it sleeps
  let heading = -Math.PI / 2;    // facing up
  let wanderA = Math.random() * Math.PI * 2;
  let paused = false;
  let nextMood = 0;
  let fear = 0;

  let alive = false;
  let dragging = false;
  const ptr = { x: 0, y: 0, on: false };
  let grips = 0;
  let pairs = 0;
  let running = false;
  let last = 0;
  let acc = 0;
  let mood = '';

  const words = [];

  // ---- Build the SVG -------------------------------------------------------
  const wordLayer = document.createElement('div');
  wordLayer.className = 'ero-words';
  wordLayer.setAttribute('aria-hidden', 'true');
  stage.insertBefore(wordLayer, svg);

  function line(cls) {
    const el = document.createElementNS(NS, 'line');
    el.setAttribute('class', cls);
    svg.appendChild(el);
    return el;
  }
  function dot(cls, r) {
    const el = document.createElementNS(NS, 'circle');
    el.setAttribute('class', cls);
    el.setAttribute('r', r);
    svg.appendChild(el);
    return el;
  }

  // Legs go in first so the body draws on top of them.
  const legs = [];
  SLOTS.forEach(([hipL, hipR, deg], slot) => {
    [-1, 1].forEach((side) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'ero-leg');
      svg.appendChild(g);
      const leg = {
        slot, side, hip: side < 0 ? hipL : hipR, angle: deg * Math.PI / 180,
        active: false, dying: false, grow: 0,
        foot: { x: 0, y: 0 }, from: { x: 0, y: 0 }, to: { x: 0, y: 0 },
        t: 1, dur: 200, word: null, g
      };
      leg.thigh = line('limb'); leg.shin = line('limb');
      leg.kneeDot = dot('dot', '2.2'); leg.footDot = dot('dot', '2.6');
      [leg.thigh, leg.shin, leg.kneeDot, leg.footDot].forEach((el) => g.appendChild(el));
      legs.push(leg);
    });
  });
  const legAt = (slot, side) => legs[slot * 2 + (side < 0 ? 0 : 1)];

  const lineEls = BODY_LINES.map(() => line('limb'));
  const dotEls = BODY.map((_, i) => {
    const hit = dot('hit', '22'); // big invisible tap area for fingers
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', 'Body dot ' + (i + 1) + '. Wake the spider.');
    const d = dot('dot', '3.4');

    hit.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const wasAlive = alive;
      wake();
      if (wasAlive) {           // you caught it: drag it around
        dragging = true;
        svg.setPointerCapture(e.pointerId);
      }
      setPointer(e);
    });
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wake(); }
    });
    return { hit, dot: d };
  });

  // ---- Words ---------------------------------------------------------------
  function scatterWords() {
    legs.forEach((leg) => { leg.word = null; });
    words.length = 0;
    wordLayer.textContent = '';
    const count = Math.round(Math.min(75, Math.max(18, (W * H) / 6500)));
    const pad = 10;
    for (let k = 0; k < count; k++) {
      const el = document.createElement('span');
      el.className = 'ero-word';
      el.textContent = WORDS[Math.floor(Math.random() * WORDS.length)];
      el.style.fontSize = (10 + Math.floor(Math.random() * 6)) + 'px';
      wordLayer.appendChild(el);
      const w = el.offsetWidth, h = el.offsetHeight;
      let spot = null;
      for (let tries = 0; tries < 25 && !spot; tries++) {
        const x = 6 + Math.random() * Math.max(1, W - w - 12);
        const y = 6 + Math.random() * Math.max(1, H - h - 12);
        // keep the sleeping spot clear so the dormant spider is readable
        const nearHome = Math.hypot(x + w / 2 - home.x, y + h / 2 - home.y) < 90 * scale;
        const hits = words.some((o) => x < o.x + o.w + pad && x + w + pad > o.x && y < o.y + o.h + pad && y + h + pad > o.y);
        if (!nearHome && !hits) spot = { x, y };
      }
      if (!spot) { el.remove(); continue; }
      el.style.transform = 'translate(' + spot.x.toFixed(1) + 'px,' + spot.y.toFixed(1) + 'px)';
      words.push({ el, x: spot.x, y: spot.y, w, h, feet: 0, bites: 0 });
    }
  }

  // Nearest point on any word close to (x, y) that the hip can still reach.
  function findWord(x, y, radius, hip) {
    let best = null, bestD = radius;
    const maxReach = 2 * SEG * scale * 0.95;
    for (const w of words) {
      const px = Math.min(w.x + w.w, Math.max(w.x, x));
      const py = Math.min(w.y + w.h, Math.max(w.y, y));
      const d = Math.hypot(px - x, py - y);
      if (d < bestD && Math.hypot(px - hip.x, py - hip.y) < maxReach) {
        bestD = d;
        best = { word: w, x: px, y: py };
      }
    }
    return best;
  }

  function grip(leg) {
    const w = leg.word;
    if (!w) return;
    w.feet++;
    w.bites++;
    w.el.classList.add('ero-gripped');
    if (w.bites >= 4) w.el.classList.add('ero-worn'); // chewed on too often
    grips++;
    if (grips % GRIPS_PER_PAIR === 0) growPair();
    updateMeta();
  }

  function release(leg) {
    const w = leg.word;
    if (!w) return;
    leg.word = null;
    w.feet = Math.max(0, w.feet - 1);
    if (w.feet === 0) w.el.classList.remove('ero-gripped');
  }

  // ---- Legs ----------------------------------------------------------------
  function growPair() {
    if (pairs >= GROW_ORDER.length) return;
    const slot = GROW_ORDER[pairs++];
    [-1, 1].forEach((side) => {
      const leg = legAt(slot, side);
      leg.active = true;
      leg.dying = false;
      const p = idealFoot(leg);
      leg.foot.x = p.x; leg.foot.y = p.y;
      leg.t = 1;
    });
    updateMeta();
  }

  function idealFoot(leg) {
    const hp = pos[leg.hip];
    const a = heading + leg.side * leg.angle;
    const r = REACH * scale;
    // Aim ahead of the body, but never further than the leg can reach.
    let lx = V.x * LEAD, ly = V.y * LEAD;
    const lead = Math.hypot(lx, ly), maxLead = r * 0.4;
    if (lead > maxLead) { lx *= maxLead / lead; ly *= maxLead / lead; }
    return { x: hp.x + Math.cos(a) * r + lx, y: hp.y + Math.sin(a) * r + ly };
  }

  function neighbourBusy(leg) {
    const check = [legAt(leg.slot, -leg.side)];
    if (leg.slot > 0) check.push(legAt(leg.slot - 1, leg.side));
    if (leg.slot < SLOTS.length - 1) check.push(legAt(leg.slot + 1, leg.side));
    return check.some((o) => o.active && o.t < 1);
  }

  function startStep(leg, ideal) {
    release(leg);
    const hp = pos[leg.hip];
    const hit = findWord(ideal.x, ideal.y, REACH * scale * 0.7, hp);
    leg.from.x = leg.foot.x; leg.from.y = leg.foot.y;
    leg.to.x = hit ? hit.x : ideal.x;
    leg.to.y = hit ? hit.y : ideal.y;
    leg.word = hit ? hit.word : null;
    const speed = Math.hypot(V.x, V.y);
    leg.dur = Math.max(80, 230 - speed * 32);
    leg.t = 0;
  }

  function updateLegs() {
    const r = REACH * scale;
    const maxReach = 2 * SEG * scale;
    for (const leg of legs) {
      if (!leg.active) continue;

      if (leg.dying) {
        leg.grow -= 0.04;
        if (leg.grow <= 0) { leg.grow = 0; leg.active = false; leg.dying = false; }
        continue;
      }
      if (leg.grow < 1) leg.grow = Math.min(1, leg.grow + 0.025);

      const ideal = idealFoot(leg);

      if (!alive) {
        // Asleep: tuck the foot back to its resting place.
        leg.foot.x += (ideal.x - leg.foot.x) * 0.09;
        leg.foot.y += (ideal.y - leg.foot.y) * 0.09;
        leg.t = 1;
        continue;
      }

      if (leg.t < 1) {
        // Mid-step: the foot swings toward its new spot.
        leg.t = Math.min(1, leg.t + STEP / leg.dur);
        const e = leg.t * leg.t * (3 - 2 * leg.t);
        leg.foot.x = leg.from.x + (leg.to.x - leg.from.x) * e;
        leg.foot.y = leg.from.y + (leg.to.y - leg.from.y) * e;
        if (leg.t === 1) grip(leg);
        continue;
      }

      // Planted: stay put until the body has moved away from this foot.
      const hp = pos[leg.hip];
      const fromIdeal = Math.hypot(leg.foot.x - ideal.x, leg.foot.y - ideal.y);
      const fromHip = Math.hypot(leg.foot.x - hp.x, leg.foot.y - hp.y);
      const overstretched = fromHip > maxReach * 0.92;
      if ((fromIdeal > r * 0.45 && !neighbourBusy(leg)) || overstretched) startStep(leg, ideal);
    }
  }

  // ---- Layout --------------------------------------------------------------
  let laidW = 0, laidH = 0;
  function layout() {
    const rect = stage.getBoundingClientRect();
    W = Math.max(200, rect.width);
    H = Math.max(200, rect.height);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    scale = Math.min(1.3, Math.max(0.7, Math.min(W, H) / 560));
    home.x = W / 2;
    home.y = H / 2;

    if (!alive) { B.x = home.x; B.y = home.y; }
    B.x = Math.min(W - 20, Math.max(20, B.x));
    B.y = Math.min(H - 20, Math.max(20, B.y));

    if (Math.abs(W - laidW) > 40 || Math.abs(H - laidH) > 40) {
      laidW = W; laidH = H;
      scatterWords();
    }

    if (!alive) {
      placeBodyAtRest();
      legs.forEach((leg) => {
        if (!leg.active) return;
        const p = idealFoot(leg);
        leg.foot.x = p.x; leg.foot.y = p.y;
      });
    }
    draw();
  }

  function bodyTarget(i) {
    const c = Math.cos(heading), s = Math.sin(heading);
    const [lx, ly] = BODY[i];
    return { x: B.x + (lx * c - ly * s) * scale, y: B.y + (lx * s + ly * c) * scale };
  }

  function placeBodyAtRest() {
    for (let i = 0; i < n; i++) {
      const p = bodyTarget(i);
      pos[i].x = prev[i].x = p.x;
      pos[i].y = prev[i].y = p.y;
    }
  }

  // ---- Waking and sleeping -------------------------------------------------
  function wake() {
    if (!alive) {
      alive = true;
      document.body.classList.add('alive');
      svg.classList.add('alive');
      nextMood = 0;
    }
    start();
  }

  function purge() {
    alive = false;
    dragging = false;
    document.body.classList.remove('alive');
    svg.classList.remove('alive');
    setMood('DORMANT');
    legs.forEach(release);
    grips = 0;
    words.forEach((w) => { w.bites = 0; w.el.classList.remove('ero-worn', 'ero-gripped'); });
    // Extra legs wither away; the starting pairs stay.
    const keep = new Set(GROW_ORDER.slice(0, START_PAIRS));
    legs.forEach((leg) => { if (leg.active && !keep.has(leg.slot)) leg.dying = true; });
    pairs = START_PAIRS;
    updateMeta();
    start(); // run until it has settled back into the rest pose
  }

  function setMood(text) {
    if (text === mood) return;
    mood = text;
    statusEl.textContent = text;
  }

  function updateMeta() {
    const legCount = legs.filter((l) => l.active && !l.dying).length;
    metaEl.textContent = (n + legCount * 2) + ' DOTS / ' + legCount + ' LEGS / ' + grips + ' WORDS GRIPPED';
  }

  // ---- Steering ------------------------------------------------------------
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function steer(now) {
    if (!alive) {
      // Walk home and face up.
      V.x = (home.x - B.x) * 0.08;
      V.y = (home.y - B.y) * 0.08;
      B.x += V.x; B.y += V.y;
      heading += wrap(-Math.PI / 2 - heading) * 0.08;
      return;
    }

    if (dragging) {
      // Caught: it is hauled toward the pointer.
      V.x = Math.max(-9, Math.min(9, (ptr.x - B.x) * 0.18));
      V.y = Math.max(-9, Math.min(9, (ptr.y - B.y) * 0.18));
      B.x += V.x; B.y += V.y;
      fear = 1;
      setMood('CAUGHT');
    } else if (reduceMotion.matches) {
      V.x *= 0.8; V.y *= 0.8;
      B.x += V.x; B.y += V.y;
      setMood('RUNNING');
    } else {
      // Spiders walk in bursts: sometimes it just stops and waits.
      if (now > nextMood) {
        paused = Math.random() < 0.3;
        nextMood = now + (paused ? 400 + Math.random() * 1200 : 1500 + Math.random() * 3500);
      }
      wanderA += (Math.random() - 0.5) * 0.3;
      let dx = Math.cos(wanderA), dy = Math.sin(wanderA);

      // Turn away from the walls.
      const m = 100 * scale;
      if (B.x < m) dx += (m - B.x) / m * 2.5;
      if (B.x > W - m) dx -= (B.x - (W - m)) / m * 2.5;
      if (B.y < m) dy += (m - B.y) / m * 2.5;
      if (B.y > H - m) dy -= (B.y - (H - m)) / m * 2.5;

      // Shy: bolt away from the cursor.
      fear = 0;
      if (ptr.on) {
        const fx = B.x - ptr.x, fy = B.y - ptr.y;
        const d = Math.hypot(fx, fy) || 1;
        const radius = FLEE_RADIUS * scale;
        if (d < radius) {
          fear = 1 - d / radius;
          dx += (fx / d) * fear * 5;
          dy += (fy / d) * fear * 5;
        }
      }

      const len = Math.hypot(dx, dy) || 1;
      wanderA += wrap(Math.atan2(dy, dx) - wanderA) * 0.15;
      let speed = (CRUISE + fear * (FLEE_SPEED - CRUISE)) * scale;
      if (paused && fear === 0) speed = 0;
      const accel = fear > 0 ? 0.25 : 0.07;
      V.x += ((dx / len) * speed - V.x) * accel;
      V.y += ((dy / len) * speed - V.y) * accel;
      B.x += V.x; B.y += V.y;
      setMood(fear > 0.25 ? 'SPOOKED' : paused ? 'LURKING' : 'RUNNING');
    }

    B.x = Math.min(W - 24, Math.max(24, B.x));
    B.y = Math.min(H - 24, Math.max(24, B.y));
    if (Math.hypot(V.x, V.y) > 0.15) heading += wrap(Math.atan2(V.y, V.x) - heading) * (0.08 + fear * 0.12);
  }

  // ---- Simulation ----------------------------------------------------------
  function step(now) {
    steer(now);
    const t = now / 1000;

    // Body dots: own momentum, then chase their place on the moving body.
    for (let i = 0; i < n; i++) {
      const vx = (pos[i].x - prev[i].x) * DAMPING;
      const vy = (pos[i].y - prev[i].y) * DAMPING;
      prev[i].x = pos[i].x;
      prev[i].y = pos[i].y;
      const p = bodyTarget(i);
      pos[i].x += vx + (p.x - pos[i].x) * BODY_SPRING;
      pos[i].y += vy + (p.y - pos[i].y) * BODY_SPRING;
      if (alive) {
        // A little breathing so it never hangs dead still.
        pos[i].x += Math.cos(t * 3.1 + i * 1.7) * 0.15;
        pos[i].y += Math.sin(t * 2.7 + i * 1.3) * 0.15;
      }
    }

    // Keep the body lines at their length.
    for (let k = 0; k < ITERATIONS; k++) {
      for (const e of edges) {
        const p = pos[e.a], q = pos[e.b];
        const dx = q.x - p.x, dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = (d - e.len * scale) / d * 0.5;
        p.x += dx * diff; p.y += dy * diff;
        q.x -= dx * diff; q.y -= dy * diff;
      }
    }

    updateLegs();
  }

  function settled() {
    if (Math.hypot(B.x - home.x, B.y - home.y) > 0.3) return false;
    if (Math.abs(wrap(heading + Math.PI / 2)) > 0.005) return false;
    for (let i = 0; i < n; i++) {
      if (Math.abs(pos[i].x - prev[i].x) > 0.02 || Math.abs(pos[i].y - prev[i].y) > 0.02) return false;
    }
    for (const leg of legs) {
      if (!leg.active) continue;
      if (leg.dying || leg.grow < 1) return false;
      const p = idealFoot(leg);
      if (Math.abs(leg.foot.x - p.x) > 0.3 || Math.abs(leg.foot.y - p.y) > 0.3) return false;
    }
    return true;
  }

  // ---- Drawing -------------------------------------------------------------
  function setLine(el, ax, ay, bx, by) {
    el.setAttribute('x1', ax.toFixed(1));
    el.setAttribute('y1', ay.toFixed(1));
    el.setAttribute('x2', bx.toFixed(1));
    el.setAttribute('y2', by.toFixed(1));
  }
  function setDot(el, x, y) {
    el.setAttribute('cx', x.toFixed(1));
    el.setAttribute('cy', y.toFixed(1));
  }

  function drawLeg(leg) {
    if (!leg.active) { leg.g.setAttribute('visibility', 'hidden'); return; }
    leg.g.setAttribute('visibility', 'visible');

    const hp = pos[leg.hip];
    // A growing leg reaches only part of the way out.
    const fx = hp.x + (leg.foot.x - hp.x) * leg.grow;
    const fy = hp.y + (leg.foot.y - hp.y) * leg.grow;
    const L = SEG * scale * Math.max(0.05, leg.grow);

    // Knee: the two segments meet at a point off the hip-foot line.
    const dx = fx - hp.x, dy = fy - hp.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const half = Math.min(d, 2 * L * 0.999) / 2;
    let px = -dy / d, py = dx / d;
    const mx = hp.x + dx / 2, my = hp.y + dy / 2;
    if ((mx - B.x) * px + (my - B.y) * py < 0) { px = -px; py = -py; } // bend outward
    const lift = leg.t < 1 ? Math.sin(leg.t * Math.PI) * 7 * scale : 0;
    const off = Math.sqrt(L * L - half * half) + lift;
    const kx = mx + px * off, ky = my + py * off;

    setLine(leg.thigh, hp.x, hp.y, kx, ky);
    setLine(leg.shin, kx, ky, fx, fy);
    setDot(leg.kneeDot, kx, ky);
    setDot(leg.footDot, fx, fy);
  }

  function draw() {
    legs.forEach(drawLeg);
    BODY_LINES.forEach(([a, b], i) => setLine(lineEls[i], pos[a].x, pos[a].y, pos[b].x, pos[b].y));
    for (let i = 0; i < n; i++) {
      setDot(dotEls[i].hit, pos[i].x, pos[i].y);
      setDot(dotEls[i].dot, pos[i].x, pos[i].y);
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
  function setPointer(e) {
    const r = stage.getBoundingClientRect();
    ptr.x = e.clientX - r.left;
    ptr.y = e.clientY - r.top;
    ptr.on = ptr.x >= 0 && ptr.y >= 0 && ptr.x <= r.width && ptr.y <= r.height;
  }

  window.addEventListener('pointermove', setPointer);
  document.addEventListener('pointerleave', () => { ptr.on = false; });
  window.addEventListener('pointerup', (e) => {
    dragging = false;
    if (e.pointerType !== 'mouse') ptr.on = false; // a lifted finger is gone
  });
  window.addEventListener('pointercancel', () => { dragging = false; ptr.on = false; });
  purgeBtn.addEventListener('click', purge);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (alive || !settled())) start(); });
  new ResizeObserver(layout).observe(stage);

  for (let i = 0; i < START_PAIRS; i++) growPair();
  legs.forEach((leg) => { if (leg.active) leg.grow = 1; });
  layout();
  updateMeta();
})();
