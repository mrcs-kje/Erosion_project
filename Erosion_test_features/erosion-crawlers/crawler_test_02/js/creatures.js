/*
  EROSION.EXE: the creatures.

  Every creature has the same "brain" (steer): a slow random wander, pauses,
  soft walls at the edges of what you can see, a strong urge to flee your
  cursor, and a hurry to catch up if you scroll away from it.

  What differs is the body:
  - CRAWLER: a soft 12-dot body with simple two-part legs. Legs plant on
    letters and step when the body has moved on. Every few words it grips it
    grows a new pair (max 8 legs), and the more legs, the longer they get.
  - STRIDER: a small body on 8 long, three-jointed legs that walk in the
    real spider rhythm (two groups of four that take turns).
  - SNAKE: a chain of dots where each dot follows the one in front. The head
    swings side to side as it travels, so the body draws S-curves. It hunts:
    it picks a word ahead of it, goes for it and swallows it.

  Swallowing marks a word with a CSS class (it fades out) and sends a bulge
  down the creature's body.
*/
(() => {
  'use strict';

  const ERO = window.ERO;
  const words = ERO.words;
  const NS = 'http://www.w3.org/2000/svg';
  const STEP = 1000 / 60;

  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---- SVG helpers ---------------------------------------------------------
  function make(parent, tag, cls, attrs) {
    const el = document.createElementNS(NS, tag);
    if (cls) el.setAttribute('class', cls);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    parent.appendChild(el);
    return el;
  }
  function setLine(el, ax, ay, bx, by) {
    el.setAttribute('x1', ax.toFixed(1));
    el.setAttribute('y1', ay.toFixed(1));
    el.setAttribute('x2', bx.toFixed(1));
    el.setAttribute('y2', by.toFixed(1));
  }
  function setDot(el, x, y, r) {
    el.setAttribute('cx', x.toFixed(1));
    el.setAttribute('cy', y.toFixed(1));
    if (r !== undefined) el.setAttribute('r', r.toFixed(2));
  }
  function show(el, on) { el.setAttribute('visibility', on ? 'visible' : 'hidden'); }

  // Two equal segments of length L from a to b: where does the joint go?
  // (px, py) says which side to bend toward.
  function knee(ax, ay, bx, by, L, px, py, extra) {
    const dx = bx - ax, dy = by - ay;
    const d = Math.hypot(dx, dy) || 0.001;
    const half = Math.min(d, 2 * L * 0.999) / 2;
    let qx = -dy / d, qy = dx / d;
    if (qx * px + qy * py < 0) { qx = -qx; qy = -qy; }
    const off = Math.sqrt(L * L - half * half) + (extra || 0);
    return { x: ax + dx / 2 + qx * off, y: ay + dy / 2 + qy * off };
  }

  // ---- Shared state and brain ----------------------------------------------
  function base(name, tune) {
    return {
      name, p: tune, alive: false,
      B: { x: 0, y: 0 }, V: { x: 0, y: 0 }, home: { x: 0, y: 0 },
      heading: -Math.PI / 2, restHeading: -Math.PI / 2,
      wanderA: Math.random() * Math.PI * 2, paused: false, nextMood: 0,
      fear: 0, mood: 'DORMANT', travel: 0, bulges: [], nextBite: 0, eaten: 0,
      now: 0, hits: []
    };
  }

  function steer(c, now, env) {
    const P = c.p, s = env.scale;

    if (!c.alive) {
      // Asleep: walk home and face up.
      let vx = (c.home.x - c.B.x) * 0.08, vy = (c.home.y - c.B.y) * 0.08;
      const v = Math.hypot(vx, vy);
      if (v > 25) { vx *= 25 / v; vy *= 25 / v; }
      c.V.x = vx; c.V.y = vy;
      c.B.x += vx; c.B.y += vy;
      c.heading += wrap(c.restHeading - c.heading) * 0.08;
      c.fear = 0;
      c.mood = 'DORMANT';
      return;
    }

    if (env.dragged === c) {
      // Caught: hauled toward the pointer.
      c.V.x = clamp((env.ptr.x - c.B.x) * 0.18, -10, 10);
      c.V.y = clamp((env.ptr.y - c.B.y) * 0.18, -10, 10);
      c.fear = 1;
      c.mood = 'CAUGHT';
    } else if (env.reduceMotion) {
      c.V.x *= 0.8; c.V.y *= 0.8;
      c.fear = 0;
      c.mood = 'AWAKE';
    } else {
      // Creatures move in bursts: sometimes they just stop and wait.
      if (now > c.nextMood) {
        c.paused = Math.random() < P.pauseChance;
        c.nextMood = now + (c.paused ? 400 + Math.random() * 1200 : 1500 + Math.random() * 3500);
      }
      c.wanderA += (Math.random() - 0.5) * P.turn;
      let dx = Math.cos(c.wanderA), dy = Math.sin(c.wanderA);

      // Soft walls: the sides of the page and the top/bottom of the screen.
      // If it is off screen (you scrolled away) it hurries to catch up.
      const m = 90 * s, top = env.view.top, bottom = env.view.bottom;
      let hurry = 1;
      if (c.B.y < top - 20 || c.B.y > bottom + 20) {
        dy += (c.B.y < top ? 1 : -1) * 4;
        hurry = 2.5;
      } else {
        if (c.B.y < top + m) dy += (top + m - c.B.y) / m * 2.5;
        if (c.B.y > bottom - m) dy -= (c.B.y - (bottom - m)) / m * 2.5;
      }
      if (c.B.x < m) dx += (m - c.B.x) / m * 2.5;
      if (c.B.x > env.W - m) dx -= (c.B.x - (env.W - m)) / m * 2.5;

      // Something it wants (the snake's next word).
      const lure = hurry === 1 && c.lure ? c.lure(now, env) : null;
      if (lure) {
        const lx = lure.x - c.B.x, ly = lure.y - c.B.y;
        const d = Math.hypot(lx, ly) || 1;
        dx += (lx / d) * P.lure;
        dy += (ly / d) * P.lure;
      }

      // Shy: bolt away from the cursor.
      c.fear = 0;
      if (env.ptr.on) {
        const fx = c.B.x - env.ptr.x, fy = c.B.y - env.ptr.y;
        const d = Math.hypot(fx, fy) || 1;
        const radius = P.fleeRadius * s;
        if (d < radius) {
          c.fear = 1 - d / radius;
          dx += (fx / d) * c.fear * 5;
          dy += (fy / d) * c.fear * 5;
        }
      }

      const len = Math.hypot(dx, dy) || 1;
      c.wanderA += wrap(Math.atan2(dy, dx) - c.wanderA) * 0.15;
      let speed = (P.cruise * hurry + c.fear * (P.flee - P.cruise)) * s;
      if (c.paused && c.fear === 0 && hurry === 1 && !lure) speed = 0;
      const accel = c.fear > 0 || hurry > 1 ? 0.25 : 0.07;
      c.V.x += ((dx / len) * speed - c.V.x) * accel;
      c.V.y += ((dy / len) * speed - c.V.y) * accel;
      c.mood = c.fear > 0.25 ? 'SPOOKED' : hurry > 1 ? 'FOLLOWING' : lure ? 'HUNTING' : speed === 0 ? 'LURKING' : 'RUNNING';
    }

    // Move. A snake swings side to side as it travels (by distance, not time,
    // so the wave freezes when it stops).
    let mx = c.V.x, my = c.V.y;
    const v = Math.hypot(mx, my);
    if (P.wiggle && v > 0.05) {
      c.travel += v;
      const a = Math.sin(c.travel / (P.wavelength * s) * Math.PI * 2) * P.wiggle;
      const ca = Math.cos(a), sa = Math.sin(a);
      const rx = mx * ca - my * sa;
      my = mx * sa + my * ca;
      mx = rx;
    }
    c.B.x = clamp(c.B.x + mx, 20, env.W - 20);
    c.B.y = clamp(c.B.y + my, 20, env.H - 20);
    if (v > 0.15) c.heading += wrap(Math.atan2(c.V.y, c.V.x) - c.heading) * (0.08 + c.fear * 0.12);
  }

  // Bulges: swallowed words travelling down the body (0 = mouth, 1 = tail).
  function advanceBulges(c, speed) {
    c.bulges = c.bulges.map((b) => b + speed).filter((b) => b < 1.25);
  }
  function bulgeAt(c, order) {
    let r = 0;
    for (const b of c.bulges) r += Math.exp(-(((order - b) / 0.12) ** 2));
    return r;
  }

  // ---- Spiders (crawler and strider) ---------------------------------------
  function makeSpider(svg, o) {
    const c = base(o.name, o.tune);
    const n = o.body.length;
    const pos = o.body.map(() => ({ x: 0, y: 0 }));
    const prev = o.body.map(() => ({ x: 0, y: 0 }));
    const edges = o.lines.concat(o.braces).map(([a, b]) => ({
      a, b, len: Math.hypot(o.body[a][0] - o.body[b][0], o.body[a][1] - o.body[b][1])
    }));
    const front = Math.max(...o.body.map((p) => p[0]));
    const back = Math.min(...o.body.map((p) => p[0]));
    const gut = o.body.map(([x]) => (front - x) / (front - back));
    let S = 1;
    c.pairs = 0;
    c.grips = 0;
    c.legScale = 1;

    // Legs first so the body is drawn on top.
    const legs = [];
    o.slots.forEach(([hipL, hipR, deg], slot) => {
      [-1, 1].forEach((side) => {
        const g = make(svg, 'g', 'ero-leg');
        const leg = {
          slot, side, hip: side < 0 ? hipL : hipR, angle: deg * Math.PI / 180,
          group: (slot + (side < 0 ? 0 : 1)) % 2, // for the strider's alternating gait
          active: false, dying: false, grow: 0,
          foot: { x: 0, y: 0 }, from: { x: 0, y: 0 }, to: { x: 0, y: 0 },
          t: 1, dur: 200, word: null, gripped: false, g, lines: [], dots: []
        };
        for (let k = 0; k < o.segments; k++) leg.lines.push(make(g, 'line', 'limb'));
        for (let k = 0; k < o.segments; k++) leg.dots.push(make(g, 'circle', 'dot', { r: k === o.segments - 1 ? 2.6 : 2 }));
        legs.push(leg);
      });
    });
    const legAt = (slot, side) => legs[slot * 2 + (side < 0 ? 0 : 1)];
    const lineEls = o.lines.map(() => make(svg, 'line', 'limb'));
    const dotEls = o.body.map(() => make(svg, 'circle', 'dot', { r: o.dotR }));
    c.hits = o.body.map(() => make(svg, 'circle', 'hit', { r: 18 }));

    const reach = () => o.reach * S * c.legScale;
    const maxReach = () => reach() * (o.segments === 2 ? 2 * o.seg[0] : o.seg[0] + 2 * o.seg[1]);

    function bodyTarget(i) {
      const cs = Math.cos(c.heading), sn = Math.sin(c.heading);
      const [lx, ly] = o.body[i];
      return { x: c.B.x + (lx * cs - ly * sn) * S, y: c.B.y + (lx * sn + ly * cs) * S };
    }

    function idealFoot(leg) {
      const hp = pos[leg.hip];
      const a = c.heading + leg.side * leg.angle;
      const r = reach();
      // Aim ahead of the body, but never further than the leg can reach.
      let lx = c.V.x * 14, ly = c.V.y * 14;
      const lead = Math.hypot(lx, ly), maxLead = r * 0.4;
      if (lead > maxLead) { lx *= maxLead / lead; ly *= maxLead / lead; }
      return { x: hp.x + Math.cos(a) * r + lx, y: hp.y + Math.sin(a) * r + ly };
    }

    function growPair() {
      if (c.pairs >= o.maxPairs) return;
      const slot = o.growOrder[c.pairs++];
      [-1, 1].forEach((side) => {
        const leg = legAt(slot, side);
        leg.active = true;
        leg.dying = false;
        const p = idealFoot(leg);
        leg.foot.x = p.x; leg.foot.y = p.y;
        leg.t = 1;
      });
    }

    function letGo(leg) {
      if (leg.word && leg.gripped) words.release(leg.word);
      leg.word = null;
      leg.gripped = false;
    }

    function canStep(leg) {
      if (o.gait === 'tetrapod') return !legs.some((l) => l.active && l.t < 1 && l.group !== leg.group);
      const check = [legAt(leg.slot, -leg.side)];
      if (leg.slot > 0) check.push(legAt(leg.slot - 1, leg.side));
      if (leg.slot < o.slots.length - 1) check.push(legAt(leg.slot + 1, leg.side));
      return !check.some((l) => l.active && l.t < 1);
    }

    function startStep(leg, ideal) {
      letGo(leg);
      const hit = words.foothold(ideal.x, ideal.y, reach() * 0.6, pos[leg.hip], maxReach() * 0.95);
      leg.from.x = leg.foot.x; leg.from.y = leg.foot.y;
      leg.to.x = hit ? hit.x : ideal.x;
      leg.to.y = hit ? hit.y : ideal.y;
      leg.word = hit ? hit.word : null;
      leg.dur = Math.max(o.minStepMs, o.stepMs - Math.hypot(c.V.x, c.V.y) * 30);
      leg.t = 0;
    }

    function updateLegs() {
      const r = reach(), maxR = maxReach();
      for (const leg of legs) {
        if (!leg.active) continue;
        if (leg.dying) {
          leg.grow -= 0.05;
          if (leg.grow <= 0) { leg.grow = 0; leg.active = false; leg.dying = false; }
          continue;
        }
        if (leg.grow < 1) leg.grow = Math.min(1, leg.grow + 0.05);

        const ideal = idealFoot(leg);
        if (!c.alive) {
          leg.foot.x += (ideal.x - leg.foot.x) * 0.09;
          leg.foot.y += (ideal.y - leg.foot.y) * 0.09;
          leg.t = 1;
          continue;
        }

        if (leg.t < 1) {
          // Mid-step: the foot swings toward its new letter.
          leg.t = Math.min(1, leg.t + STEP / leg.dur);
          const e = leg.t * leg.t * (3 - 2 * leg.t);
          leg.foot.x = leg.from.x + (leg.to.x - leg.from.x) * e;
          leg.foot.y = leg.from.y + (leg.to.y - leg.from.y) * e;
          if (leg.t === 1 && leg.word) {
            words.grip(leg.word);
            leg.gripped = true;
            c.grips++;
            if (o.gripsPerPair && c.grips % o.gripsPerPair === 0) growPair();
          }
          continue;
        }

        // Planted: hold on until the body has moved away from this foot.
        const hp = pos[leg.hip];
        const fromIdeal = Math.hypot(leg.foot.x - ideal.x, leg.foot.y - ideal.y);
        const overstretched = Math.hypot(leg.foot.x - hp.x, leg.foot.y - hp.y) > maxR * 0.92;
        if (overstretched || (fromIdeal > r * 0.45 && canStep(leg))) {
          startStep(leg, ideal);
          if (o.gait === 'tetrapod') {
            // The rest of its group lifts together.
            for (const mate of legs) {
              if (mate === leg || !mate.active || mate.dying || mate.group !== leg.group || mate.t < 1) continue;
              const mi = idealFoot(mate);
              if (Math.hypot(mate.foot.x - mi.x, mate.foot.y - mi.y) > r * 0.2) startStep(mate, mi);
            }
          }
        }
      }
    }

    function placeAtRest() {
      for (let i = 0; i < n; i++) {
        const p = bodyTarget(i);
        pos[i].x = prev[i].x = p.x;
        pos[i].y = prev[i].y = p.y;
      }
      legs.forEach((leg) => {
        if (!leg.active) return;
        const p = idealFoot(leg);
        leg.foot.x = p.x; leg.foot.y = p.y;
      });
    }

    c.step = (now, env) => {
      S = env.scale;
      c.now = now;
      steer(c, now, env);
      const want = 1 + o.legGrowth * (c.pairs - o.startPairs);
      c.legScale += (want - c.legScale) * 0.03;

      // Body dots: own momentum, then chase their place on the moving body.
      const t = now / 1000;
      for (let i = 0; i < n; i++) {
        const vx = (pos[i].x - prev[i].x) * o.damping;
        const vy = (pos[i].y - prev[i].y) * o.damping;
        prev[i].x = pos[i].x;
        prev[i].y = pos[i].y;
        const p = bodyTarget(i);
        pos[i].x += vx + (p.x - pos[i].x) * o.spring;
        pos[i].y += vy + (p.y - pos[i].y) * o.spring;
        if (c.alive) {
          pos[i].x += Math.cos(t * 3.1 + i * 1.7) * o.breathe;
          pos[i].y += Math.sin(t * 2.7 + i * 1.3) * o.breathe;
        }
      }
      // Soft lines: only part of the length error is fixed each pass.
      for (let k = 0; k < o.iterations; k++) {
        for (const e of edges) {
          const p = pos[e.a], q = pos[e.b];
          const dx = q.x - p.x, dy = q.y - p.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const diff = (d - e.len * S) / d * o.stiff;
          p.x += dx * diff; p.y += dy * diff;
          q.x -= dx * diff; q.y -= dy * diff;
        }
      }

      updateLegs();

      // Swallow whatever word passes under the mouth (it needs time to chew).
      if (c.alive && now > c.nextBite) {
        const w = words.under(pos[0].x, pos[0].y, 3 * S);
        if (w) {
          words.swallow(w);
          c.bulges.push(0);
          c.eaten++;
          c.nextBite = now + o.biteGap;
        }
      }
      advanceBulges(c, 0.022);
    };

    c.draw = () => {
      for (const leg of legs) {
        if (!leg.active) { show(leg.g, false); continue; }
        show(leg.g, true);
        const hp = pos[leg.hip];
        // A growing leg only reaches part of the way out.
        const gr = leg.grow;
        const fx = hp.x + (leg.foot.x - hp.x) * gr;
        const fy = hp.y + (leg.foot.y - hp.y) * gr;
        const R = reach() * Math.max(0.05, gr);
        const px = (hp.x + fx) / 2 - c.B.x, py = (hp.y + fy) / 2 - c.B.y; // outward
        const lift = leg.t < 1 ? Math.sin(leg.t * Math.PI) : 0;

        if (o.segments === 2) {
          const k = knee(hp.x, hp.y, fx, fy, R * o.seg[0], px, py, lift * 7 * S);
          setLine(leg.lines[0], hp.x, hp.y, k.x, k.y);
          setLine(leg.lines[1], k.x, k.y, fx, fy);
          setDot(leg.dots[0], k.x, k.y);
          setDot(leg.dots[1], fx, fy);
        } else {
          // Three joints: the thigh shoots out sideways, then the rest of
          // the leg arches down to the foot.
          const dx = fx - hp.x, dy = fy - hp.y;
          const d = Math.hypot(dx, dy) || 0.001;
          const ux = dx / d, uy = dy / d;
          let qx = -uy, qy = ux;
          if (qx * px + qy * py < 0) { qx = -qx; qy = -qy; }
          const a = 0.75 + lift * 0.35;
          const L1 = R * o.seg[0];
          const k1x = hp.x + (ux * Math.cos(a) + qx * Math.sin(a)) * L1;
          const k1y = hp.y + (uy * Math.cos(a) + qy * Math.sin(a)) * L1;
          const k2 = knee(k1x, k1y, fx, fy, R * o.seg[1], qx, qy, lift * 4 * S);
          setLine(leg.lines[0], hp.x, hp.y, k1x, k1y);
          setLine(leg.lines[1], k1x, k1y, k2.x, k2.y);
          setLine(leg.lines[2], k2.x, k2.y, fx, fy);
          setDot(leg.dots[0], k1x, k1y);
          setDot(leg.dots[1], k2.x, k2.y);
          setDot(leg.dots[2], fx, fy);
        }
      }
      o.lines.forEach(([a, b], i) => setLine(lineEls[i], pos[a].x, pos[a].y, pos[b].x, pos[b].y));
      for (let i = 0; i < n; i++) {
        setDot(dotEls[i], pos[i].x, pos[i].y, o.dotR + bulgeAt(c, gut[i]) * 2.4);
        setDot(c.hits[i], pos[i].x, pos[i].y);
      }
    };

    c.setHome = (x, y, scale) => {
      c.home.x = x; c.home.y = y;
      S = scale;
      if (!c.alive) {
        c.B.x = x; c.B.y = y;
        c.heading = c.restHeading;
        placeAtRest();
      }
    };

    c.teleport = (dx, dy) => {
      c.B.x += dx; c.B.y += dy;
      for (let i = 0; i < n; i++) { pos[i].x += dx; pos[i].y += dy; prev[i].x += dx; prev[i].y += dy; }
      for (const leg of legs) {
        letGo(leg);
        leg.foot.x += dx; leg.foot.y += dy;
        leg.t = 1;
      }
    };

    c.wake = () => { c.alive = true; c.nextMood = 0; };
    c.sleep = () => { c.alive = false; legs.forEach(letGo); };

    c.reset = () => {
      // Extra legs wither away; the starting pairs stay.
      const keep = new Set(o.growOrder.slice(0, o.startPairs));
      legs.forEach((leg) => { if (leg.active && !keep.has(leg.slot)) leg.dying = true; });
      c.pairs = o.startPairs;
      c.grips = 0;
      c.eaten = 0;
      c.bulges = [];
    };

    c.settled = () => {
      if (c.bulges.length) return false;
      if (Math.hypot(c.B.x - c.home.x, c.B.y - c.home.y) > 0.3) return false;
      if (Math.abs(wrap(c.heading - c.restHeading)) > 0.005) return false;
      if (Math.abs(c.legScale - (1 + o.legGrowth * (c.pairs - o.startPairs))) > 0.002) return false;
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
    };

    c.label = () => legs.filter((l) => l.active && !l.dying).length + ' LEGS';

    for (let i = 0; i < o.startPairs; i++) growPair();
    legs.forEach((leg) => { if (leg.active) leg.grow = 1; });
    return c;
  }

  // ---- Snake ---------------------------------------------------------------
  function makeSnake(svg, o) {
    const c = base(o.name, o.tune);
    let S = 1;
    let len = o.startLen;
    const pts = Array.from({ length: o.maxLen }, () => ({ x: 0, y: 0 }));
    const rest = Array.from({ length: o.maxLen }, () => ({ x: 0, y: 0 }));
    const lineEls = pts.slice(1).map(() => make(svg, 'line', 'limb'));
    const tongue = make(svg, 'polyline', 'ero-tongue');
    const dotEls = pts.map(() => make(svg, 'circle', 'dot'));
    c.hits = pts.map(() => make(svg, 'circle', 'hit', { r: 14 }));
    let target = null, targetUntil = 0, nextLook = 0;
    let nextFlick = 0, flickUntil = 0;

    // Resting pose: a flat coil with the head in the middle.
    function coil() {
      let a = 0, r = 7 * S;
      const gap = 8 * S / (Math.PI * 2); // rings about 8px apart
      for (let i = 0; i < o.maxLen; i++) {
        rest[i].x = c.home.x + Math.cos(a) * r;
        rest[i].y = c.home.y + Math.sin(a) * r;
        const da = (o.seg * S) / r;
        a += da;
        r += gap * da;
      }
    }

    // Pick a word ahead and go for it.
    c.lure = (now) => {
      const head = pts[0];
      if (target) {
        const tx = target.x + target.w / 2, ty = target.y + target.h * 0.55;
        if (target.gone || now > targetUntil || Math.hypot(tx - head.x, ty - head.y) > 240 * S) target = null;
      }
      if (!target && now > nextLook) {
        nextLook = now + 300;
        target = words.ahead(head.x, head.y, c.heading, 170 * S, 0.35);
        targetUntil = now + 4000;
      }
      return target ? { x: target.x + target.w / 2, y: target.y + target.h * 0.55 } : null;
    };

    c.step = (now, env) => {
      S = env.scale;
      c.now = now;

      if (!c.alive) {
        // Asleep: every dot slides back into the coil.
        for (let i = 0; i < o.maxLen; i++) {
          pts[i].x += (rest[i].x - pts[i].x) * 0.08;
          pts[i].y += (rest[i].y - pts[i].y) * 0.08;
        }
        c.B.x = pts[0].x; c.B.y = pts[0].y;
        c.V.x = c.V.y = 0;
        c.mood = 'DORMANT';
        advanceBulges(c, 0.012);
        return;
      }

      steer(c, now, env);

      // Follow the leader: each dot stays one segment behind the one in front.
      pts[0].x = c.B.x; pts[0].y = c.B.y;
      const seg = o.seg * S;
      for (let i = 1; i < len; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        b.x = a.x + (dx / d) * seg;
        b.y = a.y + (dy / d) * seg;
      }
      // The tail tucks in behind the last visible dot so growing looks smooth.
      for (let i = len; i < o.maxLen; i++) { pts[i].x = pts[len - 1].x; pts[i].y = pts[len - 1].y; }

      // Tongue flicks now and then.
      if (now > nextFlick) {
        flickUntil = now + 220;
        nextFlick = now + 900 + Math.random() * 2200;
      }

      // Swallow the word it was hunting once the head reaches it.
      if (target && !target.gone) {
        const tx = target.x + target.w / 2, ty = target.y + target.h * 0.55;
        if (Math.hypot(tx - pts[0].x, ty - pts[0].y) < 12 * S) {
          words.swallow(target);
          target = null;
          c.bulges.push(0);
          c.eaten++;
          if (c.eaten % o.growEvery === 0 && len < o.maxLen) len++;
        }
      }
      advanceBulges(c, 0.012);
    };

    c.draw = () => {
      for (let i = 0; i < o.maxLen - 1; i++) {
        const on = i < len - 1;
        show(lineEls[i], on);
        if (on) setLine(lineEls[i], pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      }
      for (let i = 0; i < o.maxLen; i++) {
        const on = i < len;
        show(dotEls[i], on);
        show(c.hits[i], on);
        if (!on) continue;
        const order = i / (len - 1);
        const r = (i === 0 ? 3.8 : 3.2 - 1.8 * order) + bulgeAt(c, order) * 2.6;
        setDot(dotEls[i], pts[i].x, pts[i].y, r);
        setDot(c.hits[i], pts[i].x, pts[i].y);
      }
      if (c.alive && c.now < flickUntil) {
        const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
        const a = Math.atan2(dy, dx);
        const bx = pts[0].x + Math.cos(a) * 4 * S, by = pts[0].y + Math.sin(a) * 4 * S;
        const tx = bx + Math.cos(a) * 9 * S, ty = by + Math.sin(a) * 9 * S;
        const f = 4 * S;
        tongue.setAttribute('points', [
          bx, by, tx, ty,
          tx + Math.cos(a - 0.5) * f, ty + Math.sin(a - 0.5) * f, tx, ty,
          tx + Math.cos(a + 0.5) * f, ty + Math.sin(a + 0.5) * f
        ].map((v) => v.toFixed(1)).join(' '));
      } else {
        tongue.setAttribute('points', '');
      }
    };

    c.setHome = (x, y, scale) => {
      c.home.x = x; c.home.y = y;
      S = scale;
      coil();
      if (!c.alive) {
        for (let i = 0; i < o.maxLen; i++) { pts[i].x = rest[i].x; pts[i].y = rest[i].y; }
        c.B.x = pts[0].x; c.B.y = pts[0].y;
      }
    };

    c.teleport = (dx, dy) => {
      c.B.x += dx; c.B.y += dy;
      for (const p of pts) { p.x += dx; p.y += dy; }
    };

    c.wake = () => {
      c.alive = true;
      c.nextMood = 0;
      c.heading = c.wanderA = Math.random() * Math.PI * 2;
    };
    c.sleep = () => { c.alive = false; target = null; };
    c.reset = () => { len = o.startLen; c.eaten = 0; c.bulges = []; target = null; };

    c.settled = () => {
      if (c.bulges.length) return false;
      for (let i = 0; i < o.maxLen; i++) {
        if (Math.abs(pts[i].x - rest[i].x) > 0.3 || Math.abs(pts[i].y - rest[i].y) > 0.3) return false;
      }
      return true;
    };

    c.label = () => len + ' SEGMENTS';
    return c;
  }

  // ---- The three creatures -------------------------------------------------
  const CRAWLER = {
    name: 'CRAWLER',
    // Body pose in local units: +x points forward (the head), +y is its right.
    body: [
      [24, 0], [15, -7], [15, 7], [4, -10], [4, 10], [-7, -11],
      [-7, 11], [-20, -13], [-20, 13], [-36, -9], [-36, 9], [-44, 0]
    ],
    lines: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 6], [5, 7], [6, 8], [7, 9], [8, 10], [9, 11], [10, 11]],
    braces: [[0, 3], [0, 4], [3, 4], [3, 6], [4, 5], [5, 8], [6, 7], [7, 8], [7, 10], [8, 9], [7, 11], [8, 11]],
    // Leg sockets, front to back: [left hip dot, right hip dot, splay angle].
    slots: [[1, 2, 38], [3, 4, 72], [5, 6, 104], [7, 8, 132]],
    growOrder: [1, 2, 0, 3], // which pair sprouts next
    startPairs: 2,
    maxPairs: 4,             // never more than 8 legs
    gripsPerPair: 3,         // letters gripped before a new pair grows
    legGrowth: 0.16,         // each extra pair makes every leg 16% longer
    segments: 2,
    seg: [0.76],             // segment length as a share of the reach
    reach: 58,
    gait: 'neighbour',
    stepMs: 230, minStepMs: 70,
    damping: 0.9, spring: 0.11, stiff: 0.35, iterations: 2, breathe: 0.3, // wobble
    dotR: 3.4,
    biteGap: 700,
    tune: { cruise: 1.5, flee: 7.5, fleeRadius: 190, turn: 0.3, pauseChance: 0.3 }
  };

  const STRIDER = {
    name: 'STRIDER',
    body: [
      [12, 0], [8, -6], [8, 6], [1, -8], [1, 8], [-6, -6],
      [-6, 6], [-10, 0], [-18, -8], [-18, 8], [-30, 0]
    ],
    lines: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 7], [7, 8], [7, 9], [8, 10], [9, 10]],
    braces: [[0, 3], [0, 4], [1, 2], [3, 4], [5, 6], [1, 5], [2, 6], [3, 6], [4, 5], [8, 9], [7, 10], [0, 7]],
    slots: [[1, 2, 40], [3, 4, 72], [3, 4, 108], [5, 6, 140]],
    growOrder: [0, 1, 2, 3],
    startPairs: 4,
    maxPairs: 4,
    gripsPerPair: 0,
    legGrowth: 0,
    segments: 3,
    seg: [0.5, 0.55],        // thigh, then the two lower parts
    reach: 80,
    gait: 'tetrapod',
    stepMs: 260, minStepMs: 90,
    damping: 0.88, spring: 0.14, stiff: 0.4, iterations: 2, breathe: 0.2,
    dotR: 3,
    biteGap: 1100,
    tune: { cruise: 1.8, flee: 8, fleeRadius: 210, turn: 0.22, pauseChance: 0.4 }
  };

  const SNAKE = {
    name: 'SNAKE',
    maxLen: 44,
    startLen: 18,
    seg: 9,         // px between dots
    growEvery: 2,   // words swallowed per new segment
    tune: {
      cruise: 1.4, flee: 6.5, fleeRadius: 180, turn: 0.25, pauseChance: 0.15,
      lure: 1.6,        // how hard it goes for the word it is hunting
      wiggle: 0.75,     // side-to-side swing in radians
      wavelength: 110   // px travelled per full swing
    }
  };

  ERO.makeCrawler = (svg) => makeSpider(svg, CRAWLER);
  ERO.makeStrider = (svg) => makeSpider(svg, STRIDER);
  ERO.makeSnake = (svg) => makeSnake(svg, SNAKE);
})();
