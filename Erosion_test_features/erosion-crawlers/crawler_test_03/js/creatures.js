/*
  EROSION.EXE: the creatures.

  Every creature has the same "brain" (steer):
  - ROAMING: it always has a destination, a word somewhere on the page. It
    travels there, eats it and picks the next one, so it covers the whole
    page instead of hanging around one spot.
  - It drifts a little at random on the way, sometimes pauses, keeps its
    distance from the other creatures, and bolts away from your cursor.

  What differs is the body:
  - CRAWLER: a soft wobbly body with two-part legs. Legs plant on letters
    and step when the body has moved on. Every few words it grips it grows a
    new pair (max 8 legs), and the more legs, the longer they get.
  - STRIDER: a small body on 8 long three-jointed legs that walk in the real
    spider rhythm (two groups of four that take turns).
  - SNAKE: a chain of dots where each dot follows the one in front. The head
    swings side to side, so the body draws S-curves. Small tendrils pulse
    out of its segments in a wave from head to tail. It hunts words on its
    way and, after 20 words, turns into a...
  - SQUID: a mantle that is narrow at the front and wide at the back, with
    10 trailing tentacles built like little snakes. It swims in pulses, like
    a fish with a jet, and catches words with its tentacle tips.

  Swallowing marks a word with a CSS class (it fades out) and sends a bulge
  through the creature's body.
*/
(() => {
  'use strict';

  const ERO = window.ERO;
  const words = ERO.words;
  const NS = 'http://www.w3.org/2000/svg';
  const STEP = 1000 / 60;

  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const centre = (w) => ({ x: w.x + w.w / 2, y: w.y + w.h * 0.55 });

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
  function setPoly(el, pts) {
    el.setAttribute('points', pts.map((v) => v.toFixed(1)).join(' '));
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

  // Pull every point of a chain to sit exactly `seg` behind the one before it.
  // This "follow the leader" rule is what makes snakes and tentacles trail.
  function follow(chain, count, seg) {
    for (let i = 1; i < count; i++) {
      const a = chain[i - 1], b = chain[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.001;
      b.x = a.x + (dx / d) * seg;
      b.y = a.y + (dy / d) * seg;
    }
  }

  // ---- Shared state and brain ----------------------------------------------
  function base(name, tune) {
    return {
      name, p: tune, alive: false, visible: true,
      B: { x: 0, y: 0 }, V: { x: 0, y: 0 }, home: { x: 0, y: 0 },
      heading: -Math.PI / 2, restHeading: -Math.PI / 2,
      wanderA: Math.random() * Math.PI * 2, paused: false, nextMood: 0,
      dest: null, destUntil: 0, surge: 1,
      fear: 0, mood: 'DORMANT', travel: 0, bulges: [], nextBite: 0, eaten: 0,
      now: 0, hits: []
    };
  }

  function eat(c, w) {
    words.swallow(w);
    c.bulges.push(0);
    c.eaten++;
    if (c.onEat) c.onEat(w);
  }

  // Pick the next word to travel to: often within a screen or so of where
  // you are reading, sometimes anywhere on the page.
  function pickDest(c, now, env) {
    const h = env.view.bottom - env.view.top;
    c.dest = Math.random() < 0.55
      ? words.random(env.view.top - h, env.view.bottom + h)
      : words.random(0, env.H);
    c.destUntil = now + 9000 + Math.random() * 6000;
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

    if (env.dragged === c || (c.owner && env.dragged === c.owner)) {
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
      // Every now and then it stops for a moment.
      if (now > c.nextMood) {
        c.paused = Math.random() < P.pauseChance;
        c.nextMood = now + (c.paused ? 300 + Math.random() * 900 : 2000 + Math.random() * 4000);
      }
      c.wanderA += (Math.random() - 0.5) * P.turn;
      let dx = Math.cos(c.wanderA) * 0.6, dy = Math.sin(c.wanderA) * 0.6;

      // Roam: head for the destination word (or something it is hunting).
      if (!c.dest || c.dest.gone || now > c.destUntil) pickDest(c, now, env);
      const lure = c.lure ? c.lure(now, env) : null;
      const goal = lure || (c.dest ? centre(c.dest) : null);
      if (goal) {
        const gx = goal.x - c.B.x, gy = goal.y - c.B.y;
        const d = Math.hypot(gx, gy) || 1;
        dx += (gx / d) * P.roam;
        dy += (gy / d) * P.roam;
      }

      // Soft walls at the edges of the page.
      const m = 90 * s;
      if (c.B.x < m) dx += (m - c.B.x) / m * 2.5;
      if (c.B.x > env.W - m) dx -= (c.B.x - (env.W - m)) / m * 2.5;
      if (c.B.y < m) dy += (m - c.B.y) / m * 2.5;
      if (c.B.y > env.H - m) dy -= (c.B.y - (env.H - m)) / m * 2.5;

      // Give the other creatures some room.
      const room = 240 * s;
      for (const o of env.creatures) {
        if (o === c || o === c.owner || !o.alive) continue;
        const ox = c.B.x - o.B.x, oy = c.B.y - o.B.y;
        const d = Math.hypot(ox, oy) || 1;
        if (d < room) {
          dx += (ox / d) * (1 - d / room) * 2.5;
          dy += (oy / d) * (1 - d / room) * 2.5;
        }
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
      let speed = (P.cruise + c.fear * (P.flee - P.cruise)) * s * c.surge;
      if (c.paused && c.fear === 0 && !lure) speed = 0;
      const accel = c.fear > 0 ? 0.25 : 0.07;
      c.V.x += ((dx / len) * speed - c.V.x) * accel;
      c.V.y += ((dy / len) * speed - c.V.y) * accel;
      c.mood = c.fear > 0.25 ? 'SPOOKED' : lure ? 'HUNTING' : speed === 0 ? 'LURKING' : 'ROAMING';
    }

    // Move. Snakes and squids swing side to side as they travel (by
    // distance, not time, so the wave freezes when they stop).
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

    // Arrived at the destination word: eat it and move on.
    if (c.dest && !c.dest.gone) {
      const mouth = c.mouth ? c.mouth() : c.B;
      const g = centre(c.dest);
      if (Math.hypot(g.x - mouth.x, g.y - mouth.y) < 16 * s) {
        eat(c, c.dest);
        c.dest = null;
      }
    }
  }

  // Bulges: swallowed words travelling through the body (0 = mouth, 1 = tail).
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
    c.mouth = () => pos[0];

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

      // Snack on whatever word passes under the mouth (it needs time to chew).
      if (c.alive && now > c.nextBite) {
        const w = words.under(pos[0].x, pos[0].y, 3 * S);
        if (w) {
          eat(c, w);
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
          const a = o.thighAngle + lift * 0.35;
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

    c.wake = () => { c.alive = true; c.nextMood = 0; c.dest = null; };
    c.sleep = () => { c.alive = false; c.dest = null; legs.forEach(letGo); };

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
    const c = base('SNAKE', o.tune);
    let S = 1;
    let len = o.startLen;
    const g = make(svg, 'g');
    const pts = Array.from({ length: o.maxLen }, () => ({ x: 0, y: 0 }));
    const rest = Array.from({ length: o.maxLen }, () => ({ x: 0, y: 0 }));
    // Two tendrils per segment, drawn under the body.
    const tendrils = pts.map(() => [make(g, 'polyline', 'ero-tendril'), make(g, 'polyline', 'ero-tendril')]);
    const lineEls = pts.slice(1).map(() => make(g, 'line', 'limb ero-thick'));
    const dotEls = pts.map(() => make(g, 'circle', 'dot'));
    c.hits = pts.map(() => make(g, 'circle', 'hit', { r: 16 }));
    let target = null, targetUntil = 0, nextLook = 0, fullUntil = 0;

    const radius = (i) => (i === 0 ? o.headR : o.bodyR - (o.bodyR - o.tailR) * (i / (len - 1))) * S;

    // Resting pose: a flat coil with the head in the middle.
    function coil() {
      let a = 0, r = 9 * S;
      const gap = o.coilGap * S / (Math.PI * 2);
      for (let i = 0; i < o.maxLen; i++) {
        rest[i].x = c.home.x + Math.cos(a) * r;
        rest[i].y = c.home.y + Math.sin(a) * r;
        const da = (o.seg * S) / r;
        a += da;
        r += gap * da;
      }
    }

    // On the way to its destination it snaps up words that lie in front of it.
    c.lure = (now) => {
      const head = pts[0];
      if (target && (target.gone || now > targetUntil)) target = null;
      if (!target && now > nextLook && now > fullUntil) {
        nextLook = now + 300;
        const goal = c.dest ? centre(c.dest) : null;
        const ang = goal ? Math.atan2(goal.y - head.y, goal.x - head.x) : c.heading;
        target = words.ahead(head.x, head.y, ang, 150 * S, 0.6);
        targetUntil = now + 3000;
      }
      return target ? centre(target) : null;
    };

    c.onEat = () => {
      if (c.eaten % o.growEvery === 0 && len < o.maxLen) len++;
      fullUntil = c.now + o.digestMs; // a short break before it hunts again
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
      pts[0].x = c.B.x; pts[0].y = c.B.y;
      follow(pts, len, o.seg * S);
      // The hidden tail waits behind the last dot so growing looks smooth.
      for (let i = len; i < o.maxLen; i++) { pts[i].x = pts[len - 1].x; pts[i].y = pts[len - 1].y; }

      // Swallow the word it was hunting once the head reaches it.
      if (target && !target.gone) {
        const t = centre(target);
        if (Math.hypot(t.x - pts[0].x, t.y - pts[0].y) < 14 * S) {
          eat(c, target);
          target = null;
        }
      }
      advanceBulges(c, 0.012);
    };

    c.draw = () => {
      g.style.display = c.visible ? '' : 'none';
      if (!c.visible) return;
      // Tendrils pulse out in a wave that runs from head to tail.
      const wave = c.alive ? c.now * 0.007 : 0;
      for (let i = 0; i < o.maxLen; i++) {
        const on = i > 0 && i < len - 1;
        show(tendrils[i][0], on);
        show(tendrils[i][1], on);
        if (!on) continue;
        const tx = pts[i - 1].x - pts[i + 1].x, ty = pts[i - 1].y - pts[i + 1].y;
        const tl = Math.hypot(tx, ty) || 1;
        const ux = tx / tl, uy = ty / tl;   // along the body, toward the head
        const nx = -uy, ny = ux;            // sideways
        const a = c.alive ? Math.max(0, Math.sin(wave - i * 0.5)) : 0;
        const L = (3 + 10 * a * a) * S * (1 - 0.45 * i / (len - 1));
        const r0 = radius(i);
        [-1, 1].forEach((side, k) => {
          const bx = pts[i].x + nx * side * r0, by = pts[i].y + ny * side * r0;
          // Out to the side and swept back, with the tip curling further back.
          const mx = bx + (nx * side * 0.85 - ux * 0.5) * L * 0.6;
          const my = by + (ny * side * 0.85 - uy * 0.5) * L * 0.6;
          const ex = mx + (nx * side * 0.4 - ux * 0.9) * L * 0.5;
          const ey = my + (ny * side * 0.4 - uy * 0.9) * L * 0.5;
          setPoly(tendrils[i][k], [bx, by, mx, my, ex, ey]);
        });
      }
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
        setDot(dotEls[i], pts[i].x, pts[i].y, radius(i) + bulgeAt(c, i / (len - 1)) * 3.2);
        setDot(c.hits[i], pts[i].x, pts[i].y);
      }
    };

    c.setHome = (x, y, scale) => {
      c.home.x = x; c.home.y = y;
      S = scale;
      coil();
      if (!c.alive && c.visible) {
        for (let i = 0; i < o.maxLen; i++) { pts[i].x = rest[i].x; pts[i].y = rest[i].y; }
        c.B.x = pts[0].x; c.B.y = pts[0].y;
      }
    };

    // Squid turning back into a snake on purge: start as a knot where it is.
    c.gatherAt = (x, y) => {
      for (const p of pts) { p.x = x; p.y = y; }
      c.B.x = x; c.B.y = y;
    };

    c.teleport = (dx, dy) => {
      c.B.x += dx; c.B.y += dy;
      for (const p of pts) { p.x += dx; p.y += dy; }
    };

    c.wake = () => {
      c.alive = true;
      c.nextMood = 0;
      c.dest = null;
      c.heading = c.wanderA = Math.random() * Math.PI * 2;
    };
    c.sleep = () => { c.alive = false; c.dest = null; target = null; };
    c.reset = () => { len = o.startLen; c.eaten = 0; c.bulges = []; target = null; };

    c.settled = () => {
      if (c.bulges.length) return false;
      for (let i = 0; i < o.maxLen; i++) {
        if (Math.abs(pts[i].x - rest[i].x) > 0.3 || Math.abs(pts[i].y - rest[i].y) > 0.3) return false;
      }
      return true;
    };

    c.head = () => ({ x: pts[0].x, y: pts[0].y });
    c.label = () => len + ' SEGMENTS / ' + Math.max(0, o.evolveAt - c.eaten) + ' TO SQUID';
    return c;
  }

  // ---- Squid ---------------------------------------------------------------
  function makeSquid(svg, o) {
    const c = base('SQUID', o.tune);
    let S = 1;
    let grow = 1;   // 0..1 while it unfolds out of the snake
    let jet = 0;    // phase of the swimming pulse
    const N = o.spine;
    const g = make(svg, 'g');
    const spine = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
    const norms = spine.map(() => ({ x: 0, y: 0 }));

    // Tentacles: little snakes trailing from the back. Two are extra long.
    const tentacles = [];
    for (let k = 0; k < o.tentacles; k++) {
      const count = o.longOnes.includes(k) ? o.longLen : o.armLen;
      const pts = Array.from({ length: count }, () => ({ x: 0, y: 0 }));
      tentacles.push({
        k, pts,
        lines: pts.slice(1).map(() => make(g, 'line', 'limb')),
        dots: pts.map(() => make(g, 'circle', 'dot'))
      });
    }
    const leftEls = spine.slice(1).map(() => make(g, 'line', 'limb ero-thick'));
    const rightEls = spine.slice(1).map(() => make(g, 'line', 'limb ero-thick'));
    const tipLine = make(g, 'line', 'limb ero-thick');
    const backLine = make(g, 'line', 'limb ero-thick');
    const fins = [0, 1, 2, 3].map(() => make(g, 'line', 'limb'));
    const outlineDots = spine.flatMap(() => [make(g, 'circle', 'dot'), make(g, 'circle', 'dot')]);
    const eyes = [make(g, 'circle', 'dot'), make(g, 'circle', 'dot')];
    c.hits = spine.map(() => make(g, 'circle', 'hit', { r: 20 }));
    c.visible = false;

    // Mantle width along the body: a point at the front, widest near the back.
    function width(u) {
      let w = 0.12 + 0.88 * Math.pow(Math.min(u / 0.85, 1), 0.8);
      if (u > 0.85) w *= 1 - ((u - 0.85) / 0.15) * 0.3;
      return w * o.width;
    }

    function computeNormals() {
      for (let i = 0; i < N; i++) {
        const a = spine[Math.max(0, i - 1)], b = spine[Math.min(N - 1, i + 1)];
        const tx = a.x - b.x, ty = a.y - b.y;
        const tl = Math.hypot(tx, ty) || 1;
        norms[i].x = -ty / tl;
        norms[i].y = tx / tl;
      }
    }

    function anchors() {
      // Where each tentacle is attached: spread across the back edge.
      const r = spine[N - 1], nrm = norms[N - 1];
      const half = width(1) * S * grow * 0.9;
      return tentacles.map((t) => {
        const f = (t.k / (o.tentacles - 1) - 0.5) * 2;
        return { x: r.x + nrm.x * f * half, y: r.y + nrm.y * f * half };
      });
    }

    // Lay the body out straight behind the head, facing `heading`.
    function straighten() {
      const bx = -Math.cos(c.heading), by = -Math.sin(c.heading);
      const seg = o.seg * S * grow;
      for (let i = 0; i < N; i++) { spine[i].x = c.B.x + bx * seg * i; spine[i].y = c.B.y + by * seg * i; }
      computeNormals();
      const an = anchors();
      const tseg = o.tseg * S * grow;
      tentacles.forEach((t, k) => t.pts.forEach((p, j) => {
        p.x = an[k].x + bx * tseg * j;
        p.y = an[k].y + by * tseg * j;
      }));
    }

    c.step = (now, env) => {
      S = env.scale;
      c.now = now;
      if (grow < 1) grow = Math.min(1, grow + 0.014);
      if (c.alive) jet += 0.07;
      // It swims in pulses: a squeeze of the mantle pushes it forward.
      c.surge = c.alive ? 0.55 + 0.9 * Math.max(0, Math.sin(jet)) : 1;

      steer(c, now, env);
      spine[0].x = c.B.x; spine[0].y = c.B.y;
      follow(spine, N, o.seg * S * grow);
      computeNormals();

      const an = anchors();
      const t = now / 1000;
      tentacles.forEach((ten, k) => {
        ten.pts[0].x = an[k].x; ten.pts[0].y = an[k].y;
        // Fan out: outer tentacles drift a little away from the middle ones.
        const f = (k / (o.tentacles - 1) - 0.5) * 2;
        const nrm = norms[N - 1];
        for (let j = 1; j < ten.pts.length; j++) {
          ten.pts[j].x += nrm.x * f * o.fan * S;
          ten.pts[j].y += nrm.y * f * o.fan * S;
        }
        follow(ten.pts, ten.pts.length, o.tseg * S * grow);
        if (!c.alive) return;
        // A slow wave so the tentacles never hang dead.
        for (let j = 1; j < ten.pts.length; j++) {
          const p = ten.pts[j], q = ten.pts[j - 1];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d = Math.hypot(dx, dy) || 1;
          const sway = Math.sin(t * 3.2 + j * 0.7 + k * 0.9) * 0.6 * S;
          p.x += (-dy / d) * sway;
          p.y += (dx / d) * sway;
        }
      });

      // Tentacle tips catch words they brush past.
      if (c.alive && now > c.nextBite) {
        for (const ten of tentacles) {
          const tip = ten.pts[ten.pts.length - 1];
          const w = words.under(tip.x, tip.y, 3 * S);
          if (w) { eat(c, w); c.nextBite = now + o.biteGap; break; }
        }
      }
      advanceBulges(c, 0.02);
    };

    c.draw = () => {
      g.style.display = c.visible ? '' : 'none';
      if (!c.visible) return;
      const pulse = c.alive ? Math.max(0, Math.sin(jet)) : 0;
      const L = [], R = [];
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const w = (width(u) * (1 - 0.15 * pulse) * grow + bulgeAt(c, 1 - u) * 4) * S;
        L.push({ x: spine[i].x + norms[i].x * w, y: spine[i].y + norms[i].y * w });
        R.push({ x: spine[i].x - norms[i].x * w, y: spine[i].y - norms[i].y * w });
      }

      tentacles.forEach((ten) => {
        const m = ten.pts.length;
        ten.lines.forEach((el, j) => setLine(el, ten.pts[j].x, ten.pts[j].y, ten.pts[j + 1].x, ten.pts[j + 1].y));
        ten.dots.forEach((el, j) => setDot(el, ten.pts[j].x, ten.pts[j].y, (2.6 - 1.6 * j / (m - 1)) * S * grow));
      });

      for (let i = 0; i < N - 1; i++) {
        setLine(leftEls[i], L[i].x, L[i].y, L[i + 1].x, L[i + 1].y);
        setLine(rightEls[i], R[i].x, R[i].y, R[i + 1].x, R[i + 1].y);
      }
      setLine(tipLine, L[0].x, L[0].y, R[0].x, R[0].y);
      setLine(backLine, L[N - 1].x, L[N - 1].y, R[N - 1].x, R[N - 1].y);

      // Fins: a diamond near the pointed front.
      const fin = o.fin * S * grow * (1 + 0.3 * pulse);
      const fl = { x: L[1].x + norms[1].x * fin, y: L[1].y + norms[1].y * fin };
      const fr = { x: R[1].x - norms[1].x * fin, y: R[1].y - norms[1].y * fin };
      setLine(fins[0], L[0].x, L[0].y, fl.x, fl.y);
      setLine(fins[1], fl.x, fl.y, L[3].x, L[3].y);
      setLine(fins[2], R[0].x, R[0].y, fr.x, fr.y);
      setLine(fins[3], fr.x, fr.y, R[3].x, R[3].y);

      for (let i = 0; i < N; i++) {
        setDot(outlineDots[i * 2], L[i].x, L[i].y, 2 * S);
        setDot(outlineDots[i * 2 + 1], R[i].x, R[i].y, 2 * S);
        setDot(c.hits[i], spine[i].x, spine[i].y);
      }
      const e = spine[N - 2], ew = width((N - 2) / (N - 1)) * S * grow * 0.45;
      setDot(eyes[0], e.x + norms[N - 2].x * ew, e.y + norms[N - 2].y * ew, 2.8 * S);
      setDot(eyes[1], e.x - norms[N - 2].x * ew, e.y - norms[N - 2].y * ew, 2.8 * S);
    };

    // Unfold out of the snake where its head was.
    c.emerge = (x, y, heading) => {
      c.B.x = x; c.B.y = y;
      c.V.x = c.V.y = 0;
      c.heading = c.wanderA = heading;
      grow = 0.2;
      c.visible = true;
      c.alive = true;
      c.dest = null;
      c.eaten = 0;
      c.bulges = [];
      straighten();
    };

    c.setHome = (x, y, scale) => {
      c.home.x = x; c.home.y = y;
      S = scale;
      if (!c.alive && c.visible) {
        c.B.x = x; c.B.y = y;
        c.heading = c.restHeading;
        straighten();
      }
    };

    c.teleport = (dx, dy) => {
      c.B.x += dx; c.B.y += dy;
      for (const p of spine) { p.x += dx; p.y += dy; }
      for (const t of tentacles) for (const p of t.pts) { p.x += dx; p.y += dy; }
    };

    c.wake = () => { c.alive = true; c.nextMood = 0; c.dest = null; };
    c.sleep = () => { c.alive = false; c.dest = null; };
    c.reset = () => { c.eaten = 0; c.bulges = []; };

    c.settled = () => !c.bulges.length && grow === 1 &&
      Math.hypot(c.B.x - c.home.x, c.B.y - c.home.y) < 0.3 && Math.hypot(c.V.x, c.V.y) < 0.05;

    c.label = () => o.tentacles + ' TENTACLES / ' + c.eaten + ' EATEN';
    return c;
  }

  // ---- Snake that can become a squid ---------------------------------------
  // To the rest of the page this is one creature. Inside, it is either the
  // snake or the squid, and it hands every call to whichever form it is in.
  function makeShifter(svg) {
    const snake = makeSnake(svg, SNAKE);
    const squid = makeSquid(svg, SQUID);
    let form = snake;
    const c = { hits: snake.hits.concat(squid.hits) };
    snake.owner = squid.owner = c;
    for (const key of ['name', 'alive', 'mood', 'B', 'V']) {
      Object.defineProperty(c, key, { get: () => form[key] });
    }

    function evolve() {
      const h = snake.head();
      squid.emerge(h.x, h.y, snake.heading);
      snake.visible = false;
      snake.alive = false;
      form = squid;
    }

    c.step = (now, env) => {
      form.step(now, env);
      if (form === snake && snake.alive && snake.eaten >= SNAKE.evolveAt) evolve();
    };
    // Shortcut for testing: type ERO.creatures.snake.evolve() in the console.
    c.evolve = () => {
      if (form !== snake) return;
      if (!snake.alive) snake.wake();
      evolve();
    };
    c.draw = () => { snake.draw(); squid.draw(); };
    c.setHome = (x, y, scale) => { snake.setHome(x, y, scale); squid.setHome(x, y, scale); };
    c.teleport = (dx, dy) => form.teleport(dx, dy);
    c.wake = () => form.wake();
    c.sleep = () => form.sleep();
    c.settled = () => form.settled();
    c.label = () => form.label();
    c.reset = () => {
      // PURGE: the squid shrinks back into a snake and coils up at home.
      if (form === squid) {
        snake.gatherAt(squid.B.x, squid.B.y);
        squid.visible = false;
        squid.alive = false;
        snake.visible = true;
        form = snake;
      }
      snake.reset();
      squid.reset();
    };
    return c;
  }

  // ---- The creatures' settings ---------------------------------------------
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
    // Angles near 90 point the legs straight out to the sides.
    slots: [[1, 2, 55], [3, 4, 80], [5, 6, 102], [7, 8, 125]],
    growOrder: [1, 2, 0, 3], // which pair sprouts next
    startPairs: 2,
    maxPairs: 4,             // never more than 8 legs
    gripsPerPair: 3,         // letters gripped before a new pair grows
    legGrowth: 0.16,         // each extra pair makes every leg 16% longer
    segments: 2,
    seg: [0.76],             // segment length as a share of the reach
    reach: 72,
    gait: 'neighbour',
    stepMs: 230, minStepMs: 70,
    damping: 0.9, spring: 0.11, stiff: 0.35, iterations: 2, breathe: 0.3, // wobble
    dotR: 3.4,
    biteGap: 700,
    tune: { cruise: 1.5, flee: 7.5, fleeRadius: 190, turn: 0.3, pauseChance: 0.12, roam: 1.4 }
  };

  const STRIDER = {
    name: 'STRIDER',
    body: [
      [12, 0], [8, -6], [8, 6], [1, -8], [1, 8], [-6, -6],
      [-6, 6], [-10, 0], [-18, -8], [-18, 8], [-30, 0]
    ],
    lines: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 7], [7, 8], [7, 9], [8, 10], [9, 10]],
    braces: [[0, 3], [0, 4], [1, 2], [3, 4], [5, 6], [1, 5], [2, 6], [3, 6], [4, 5], [8, 9], [7, 10], [0, 7]],
    slots: [[1, 2, 50], [3, 4, 78], [3, 4, 102], [5, 6, 130]],
    growOrder: [0, 1, 2, 3],
    startPairs: 4,
    maxPairs: 4,
    gripsPerPair: 0,
    legGrowth: 0,
    segments: 3,
    seg: [0.5, 0.55],        // thigh, then the two lower parts
    thighAngle: 0.95,        // how far the thigh swings out sideways (radians)
    reach: 100,
    gait: 'tetrapod',
    stepMs: 260, minStepMs: 90,
    damping: 0.88, spring: 0.14, stiff: 0.4, iterations: 2, breathe: 0.2,
    dotR: 3,
    biteGap: 1100,
    tune: { cruise: 1.8, flee: 8, fleeRadius: 210, turn: 0.22, pauseChance: 0.15, roam: 1.4 }
  };

  const SNAKE = {
    maxLen: 44,
    startLen: 18,
    seg: 13,          // px between dots
    headR: 5.2, bodyR: 4.4, tailR: 2.2,
    coilGap: 14,      // px between the rings of the sleeping coil
    growEvery: 2,     // words swallowed per new segment
    digestMs: 900,    // pause after eating before it hunts again
    evolveAt: 20,     // words eaten before it turns into the squid
    tune: {
      cruise: 2.4, flee: 9.5, fleeRadius: 200, turn: 0.25, pauseChance: 0.05, roam: 1.4,
      lure: 1.8,        // how hard it goes for a word it is hunting
      wiggle: 0.75,     // side-to-side swing in radians
      wavelength: 150   // px travelled per full swing
    }
  };

  const SQUID = {
    spine: 9,         // dots along the mantle
    seg: 14,          // px between them
    width: 26,        // half-width of the mantle at its widest
    fin: 14,
    fan: 0.5,         // how much the tentacles spread apart
    tentacles: 10,
    armLen: 9,        // dots per tentacle
    longLen: 14,      // the two long hunting tentacles
    longOnes: [3, 6],
    tseg: 9,
    biteGap: 900,     // ms between tentacle catches
    tune: {
      cruise: 2.2, flee: 9, fleeRadius: 220, turn: 0.2, pauseChance: 0.05, roam: 1.4,
      wiggle: 0.35, wavelength: 170 // a gentler, fish-like swing
    }
  };

  ERO.makeCrawler = (svg) => makeSpider(svg, CRAWLER);
  ERO.makeStrider = (svg) => makeSpider(svg, STRIDER);
  ERO.makeSnake = (svg) => makeShifter(svg);
})();
