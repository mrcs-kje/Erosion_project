/*
  EROSION.EXE: the creatures.

  Every creature has the same "brain" (steer):
  - ROAMING: it always has somewhere to go. Usually a word (which it eats on
    arrival), sometimes just a spot off to the side, so it wanders across
    the page as well as up and down it.
  - It drifts a little at random on the way, sometimes pauses, keeps its
    distance from the other creatures, and bolts away from your cursor...
  - ...except now and then it gets bold, STALKS the cursor and lunges at it.
    If it catches it, the cursor is "eaten" (hidden for a moment).

  What differs is the body:
  - CRAWLER: a soft wobbly body with two-part legs. Legs plant on letters
    and step when the body has moved on. Every few words it grips it grows a
    new pair (max 8 legs), and the more legs, the longer they get.
  - STRIDER: a small body on 8 long three-jointed legs that walk in the real
    spider rhythm (two groups of four that take turns).
  - SNAKE: a chain of dots where each dot follows the one in front. The head
    swings side to side, so the body draws S-curves. Small tendrils pulse
    out of its segments in a wave from head to tail. After 20 words it
    curls up into a...
  - PUPA: a silk-wrapped egg that wobbles for 10 seconds, harder and harder,
    then unfolds into the...
  - SQUID: a mantle that is narrow at the front and wide at the back, with
    10 long tentacles built like little snakes. It swims in pulses like a
    fish with a jet. Its tentacles grab onto words as it passes; the two
    long ones have pincers and eat what they grab.

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
  const smooth = (t) => t * t * (3 - 2 * t);
  const kick = () => { if (ERO.start) ERO.start(); }; // make sure the loop runs

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
  // The same, but starting from the far end (used when a tentacle tip holds on).
  function followBack(chain, count, seg) {
    for (let i = count - 2; i >= 0; i--) {
      const a = chain[i + 1], b = chain[i];
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
      dest: null, spot: null, destUntil: 0, surge: 1,
      stalkUntil: 0, nextStalk: 0,
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

  // Where to next? Mix of sideways trips, nearby words and far-away words.
  function pickDest(c, now, env) {
    const h = env.view.bottom - env.view.top;
    const r = Math.random();
    c.dest = null;
    c.spot = null;
    if (r < 0.4) {
      // A spot somewhere across the page at about the same height.
      c.spot = {
        x: 60 + Math.random() * Math.max(1, env.W - 120),
        y: clamp(c.B.y + (Math.random() - 0.5) * h, 60, env.H - 60)
      };
    } else if (r < 0.8) {
      c.dest = words.random(c.B.y - h * 0.7, c.B.y + h * 0.7);
    } else {
      c.dest = words.random(0, env.H);
    }
    if (!c.dest && !c.spot) c.spot = { x: 60 + Math.random() * Math.max(1, env.W - 120), y: c.B.y };
    c.destUntil = now + 8000 + Math.random() * 6000;
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

    const mouth = c.mouth ? c.mouth() : c.B;
    let stalking = false;

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

      // Now and then it gets bold and goes after the cursor.
      if (!c.nextStalk) c.nextStalk = now + 8000 + Math.random() * 15000;
      if (env.ptr.on && now > c.nextStalk) {
        c.stalkUntil = now + 12000;
        c.nextStalk = now + 25000 + Math.random() * 25000;
      }
      stalking = env.ptr.on && now < c.stalkUntil;

      c.wanderA += (Math.random() - 0.5) * P.turn;
      let dx = Math.cos(c.wanderA) * 0.6, dy = Math.sin(c.wanderA) * 0.6;

      // Roam toward the cursor, something it is hunting, or its destination.
      if (!stalking && (now > c.destUntil || (c.dest && c.dest.gone) || (!c.dest && !c.spot))) pickDest(c, now, env);
      if (c.spot && Math.hypot(c.spot.x - c.B.x, c.spot.y - c.B.y) < 40 * s) pickDest(c, now, env);
      const lure = !stalking && c.lure ? c.lure(now, env) : null;
      const goal = stalking ? env.ptr : lure || (c.dest ? centre(c.dest) : c.spot);
      let goalDist = Infinity;
      if (goal) {
        const gx = goal.x - c.B.x, gy = goal.y - c.B.y;
        goalDist = Math.hypot(gx, gy) || 1;
        const pull = stalking ? 3 : P.roam;
        dx += (gx / goalDist) * pull;
        dy += (gy / goalDist) * pull;
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

      // Shy: bolt away from the cursor (not while it is stalking it).
      c.fear = 0;
      if (env.ptr.on && !stalking) {
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
      if (stalking) speed = (goalDist < 170 * s ? P.flee : P.cruise * 1.6) * s * c.surge; // lunge when close
      else if (c.paused && c.fear === 0 && !lure) speed = 0;
      const accel = c.fear > 0 || stalking ? 0.25 : 0.07;
      c.V.x += ((dx / len) * speed - c.V.x) * accel;
      c.V.y += ((dy / len) * speed - c.V.y) * accel;
      c.mood = stalking ? 'STALKING' : c.fear > 0.25 ? 'SPOOKED' : lure ? 'HUNTING' : speed === 0 ? 'LURKING' : 'ROAMING';
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

    // Caught the cursor!
    if (stalking && Math.hypot(env.ptr.x - mouth.x, env.ptr.y - mouth.y) < 16 * s) {
      c.stalkUntil = 0;
      c.bulges.push(0);
      if (env.biteCursor) env.biteCursor();
    }

    // Arrived at the destination word: eat it and move on.
    if (c.dest && !c.dest.gone) {
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
          const e = smooth(leg.t);
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

    c.wake = () => { c.alive = true; c.nextMood = 0; c.nextStalk = 0; c.dest = c.spot = null; };
    c.sleep = () => { c.alive = false; c.stalkUntil = 0; c.dest = c.spot = null; legs.forEach(letGo); };

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

    // Shortcut for testing: ERO.creatures.crawler.grow() adds a pair of legs.
    c.grow = () => { growPair(); kick(); };

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
        const goal = c.dest ? centre(c.dest) : c.spot;
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

    // Coming back from pupa or squid on purge: start as a knot where it is.
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
      c.nextStalk = 0;
      c.dest = c.spot = null;
      c.heading = c.wanderA = Math.random() * Math.PI * 2;
    };
    c.sleep = () => { c.alive = false; c.stalkUntil = 0; c.dest = c.spot = null; target = null; };
    c.reset = () => { len = o.startLen; c.eaten = 0; c.bulges = []; target = null; };

    c.settled = () => {
      if (c.bulges.length) return false;
      for (let i = 0; i < o.maxLen; i++) {
        if (Math.abs(pts[i].x - rest[i].x) > 0.3 || Math.abs(pts[i].y - rest[i].y) > 0.3) return false;
      }
      return true;
    };

    c.body = () => pts.slice(0, len);
    c.label = () => len + ' SEGMENTS / ' + Math.max(0, o.evolveAt - c.eaten) + ' TO PUPA';
    return c;
  }

  // ---- Pupa ----------------------------------------------------------------
  // The snake curls into an egg wrapped in silk threads. It cannot move.
  function makePupa(svg, o) {
    const c = base('PUPA', {});
    let S = 1;
    let startAt = 0;
    const K = o.dots;
    const g = make(svg, 'g');
    const from = Array.from({ length: K }, () => ({ x: 0, y: 0 }));
    const pts = Array.from({ length: K }, () => ({ x: 0, y: 0 }));
    // Silk threads cross the egg; the outline goes on top.
    const threads = [];
    for (let i = 0; i < K; i += 2) threads.push({ a: i, b: (i + Math.round(K / 3)) % K, el: make(g, 'line', 'ero-silk') });
    const outline = pts.map(() => make(g, 'line', 'limb ero-thick'));
    const dotEls = pts.map(() => make(g, 'circle', 'dot'));
    c.hits = pts.map(() => make(g, 'circle', 'hit', { r: 16 }));
    c.visible = false;

    // Begin: the snake's dots slide into an egg shape where its head was.
    c.begin = (body, x, y, heading, now) => {
      for (let i = 0; i < K; i++) {
        const p = body[Math.round(i / (K - 1) * (body.length - 1))];
        from[i].x = pts[i].x = p.x;
        from[i].y = pts[i].y = p.y;
      }
      c.B.x = x; c.B.y = y;
      c.heading = heading;
      startAt = now;
      c.visible = true;
      c.alive = true;
      c.mood = 'PUPATING';
    };

    c.done = (now) => now - startAt > o.duration;

    c.step = (now, env) => {
      S = env.scale;
      c.now = now;
      const t = (now - startAt) / 1000;
      const curl = smooth(Math.min(1, t / o.curlSeconds));
      // Wobble: a slow rock and squash that grows stronger before hatching.
      const build = 1 + 2 * Math.max(0, (t - (o.duration / 1000 - 3)) / 3);
      const still = env.reduceMotion;
      const rock = still ? 0 : (Math.sin(t * 2.4) * 0.08 + Math.sin(t * 5.7) * 0.03) * build;
      const squash = still ? 0 : Math.sin(t * 3.1) * 0.04 * build;
      const a = c.heading + rock;
      const cs = Math.cos(a), sn = Math.sin(a);
      for (let i = 0; i < K; i++) {
        const ang = (i / K) * Math.PI * 2;
        // Egg: long along the body, a little pointier at the front.
        const lx = o.length * Math.cos(ang) * (1 + squash);
        const ly = o.width * Math.sin(ang) * (1 - 0.18 * Math.cos(ang)) * (1 - squash);
        const ex = c.B.x + (lx * cs - ly * sn) * S;
        const ey = c.B.y + (lx * sn + ly * cs) * S;
        pts[i].x = from[i].x + (ex - from[i].x) * curl;
        pts[i].y = from[i].y + (ey - from[i].y) * curl;
      }
    };

    c.draw = () => {
      g.style.display = c.visible ? '' : 'none';
      if (!c.visible) return;
      for (const th of threads) setLine(th.el, pts[th.a].x, pts[th.a].y, pts[th.b].x, pts[th.b].y);
      for (let i = 0; i < K; i++) {
        const q = pts[(i + 1) % K];
        setLine(outline[i], pts[i].x, pts[i].y, q.x, q.y);
        setDot(dotEls[i], pts[i].x, pts[i].y, 2.6 * S);
        setDot(c.hits[i], pts[i].x, pts[i].y);
      }
    };

    c.setHome = (x, y, scale) => { c.home.x = x; c.home.y = y; S = scale; };
    c.teleport = (dx, dy) => {
      c.B.x += dx; c.B.y += dy;
      for (const p of from) { p.x += dx; p.y += dy; }
    };
    c.wake = () => {};
    c.sleep = () => {};
    c.reset = () => {};
    c.settled = () => false;
    c.label = () => 'HATCHES IN ' + Math.max(0, Math.ceil((o.duration - (c.now - startAt)) / 1000)) + 'S';
    return c;
  }

  // ---- Squid ---------------------------------------------------------------
  function makeSquid(svg, o) {
    const c = base('SQUID', o.tune);
    let S = 1;
    let grow = 1;   // 0..1 while it unfolds out of the pupa
    let jet = 0;    // phase of the swimming pulse
    const N = o.spine;
    const g = make(svg, 'g');
    const spine = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
    const norms = spine.map(() => ({ x: 0, y: 0 }));

    // Tentacles: long little snakes trailing from the back. Two are longer
    // still and end in a pincer.
    const tentacles = [];
    for (let k = 0; k < o.tentacles; k++) {
      const long = o.longOnes.includes(k);
      const pts = Array.from({ length: long ? o.longLen : o.armLen }, () => ({ x: 0, y: 0 }));
      tentacles.push({
        k, long, pts, grip: null, nextTry: 0,
        lines: pts.slice(1).map(() => make(g, 'line', 'limb')),
        dots: pts.map(() => make(g, 'circle', 'dot')),
        claws: long ? [make(g, 'polyline', 'ero-tendril ero-claw'), make(g, 'polyline', 'ero-tendril ero-claw')] : null
      });
    }
    const leftEls = spine.slice(1).map(() => make(g, 'line', 'limb ero-thick'));
    const rightEls = spine.slice(1).map(() => make(g, 'line', 'limb ero-thick'));
    const tipLine = make(g, 'line', 'limb ero-thick');
    const backLine = make(g, 'line', 'limb ero-thick');
    const fins = [0, 1, 2, 3].map(() => make(g, 'line', 'limb'));
    const outlineDots = spine.flatMap(() => [make(g, 'circle', 'dot'), make(g, 'circle', 'dot')]);
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

    function letGo(ten) {
      if (ten.grip && ten.grip.held) words.release(ten.grip.word);
      ten.grip = null;
    }

    // Lay the body out straight behind the head, facing `heading`.
    function straighten() {
      const bx = -Math.cos(c.heading), by = -Math.sin(c.heading);
      const seg = o.seg * S * grow;
      for (let i = 0; i < N; i++) { spine[i].x = c.B.x + bx * seg * i; spine[i].y = c.B.y + by * seg * i; }
      computeNormals();
      const an = anchors();
      const tseg = o.tseg * S * grow;
      tentacles.forEach((t, k) => {
        letGo(t);
        t.pts.forEach((p, j) => {
          p.x = an[k].x + bx * tseg * j;
          p.y = an[k].y + by * tseg * j;
        });
      });
    }

    function updateTentacle(ten, anchor, now, t) {
      const n = ten.pts.length;
      const tseg = o.tseg * S * grow;
      const total = (n - 1) * tseg;
      const tip = ten.pts[n - 1];
      ten.pts[0].x = anchor.x; ten.pts[0].y = anchor.y;

      if (ten.grip) {
        const gp = ten.grip;
        if (gp.t < 1) {
          // Reaching: the tip travels to the letter it wants.
          gp.t = Math.min(1, gp.t + STEP / o.reachMs);
          const e = smooth(gp.t);
          gp.x = gp.fx + (gp.tx - gp.fx) * e;
          gp.y = gp.fy + (gp.ty - gp.fy) * e;
          if (gp.t === 1 && !gp.word.gone) { words.grip(gp.word); gp.held = true; }
        }
        // Holding: the tip stays on the letter, the base stays on the body,
        // and the chain stretches between them.
        for (let it = 0; it < 2; it++) {
          tip.x = gp.x; tip.y = gp.y;
          followBack(ten.pts, n, tseg);
          ten.pts[0].x = anchor.x; ten.pts[0].y = anchor.y;
          follow(ten.pts, n, tseg);
        }
        const stretched = Math.hypot(gp.x - anchor.x, gp.y - anchor.y) > total * 0.92;
        if (stretched || now > gp.until || gp.word.gone || !c.alive) {
          const word = gp.word, held = gp.held;
          letGo(ten);
          // The pincer tentacles keep what they caught.
          if (ten.long && held && !word.gone && c.alive) eat(c, word);
          ten.nextTry = now + 300 + Math.random() * 500;
        }
        return;
      }

      // Free: fan out a little, trail behind, sway.
      const f = (ten.k / (o.tentacles - 1) - 0.5) * 2;
      const nrm = norms[N - 1];
      for (let j = 1; j < n; j++) {
        ten.pts[j].x += nrm.x * f * o.fan * S;
        ten.pts[j].y += nrm.y * f * o.fan * S;
      }
      follow(ten.pts, n, tseg);
      if (!c.alive) return;
      for (let j = 1; j < n; j++) {
        const p = ten.pts[j], q = ten.pts[j - 1];
        const dx = p.x - q.x, dy = p.y - q.y;
        const d = Math.hypot(dx, dy) || 1;
        const sway = Math.sin(t * 3.2 + j * 0.45 + ten.k * 0.9) * 0.7 * S;
        p.x += (-dy / d) * sway;
        p.y += (dx / d) * sway;
      }

      // Every so often the tip reaches for a letter close by.
      if (grow === 1 && now > ten.nextTry) {
        ten.nextTry = now + 250 + Math.random() * 600;
        const hit = words.foothold(tip.x, tip.y, (ten.long ? o.longReach : o.armReach) * S, anchor, total * 0.8);
        if (hit) {
          ten.grip = {
            word: hit.word, held: false, t: 0,
            fx: tip.x, fy: tip.y, tx: hit.x, ty: hit.y, x: tip.x, y: tip.y,
            until: now + (ten.long ? o.longHoldMs : o.armHoldMs) * (0.6 + Math.random() * 0.8)
          };
        }
      }
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
      tentacles.forEach((ten, k) => updateTentacle(ten, an[k], now, t));
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

      for (const ten of tentacles) {
        const m = ten.pts.length;
        ten.lines.forEach((el, j) => setLine(el, ten.pts[j].x, ten.pts[j].y, ten.pts[j + 1].x, ten.pts[j + 1].y));
        ten.dots.forEach((el, j) => setDot(el, ten.pts[j].x, ten.pts[j].y, (2.4 - 1.5 * j / (m - 1)) * S * grow));
        if (!ten.claws) continue;
        // Pincer: two hooked prongs. Wide open while reaching, shut when holding,
        // slowly snapping while it waits.
        const tip = ten.pts[m - 1], pre = ten.pts[m - 2];
        const a = Math.atan2(tip.y - pre.y, tip.x - pre.x);
        const open = ten.grip ? (ten.grip.held ? 0.12 : 0.75) : 0.35 + 0.2 * Math.sin(c.now * 0.006 + ten.k);
        const cl = o.claw * S * grow;
        [-1, 1].forEach((side, i) => {
          const a1 = a + side * open, a2 = a - side * open * 1.3;
          const mx = tip.x + Math.cos(a1) * cl * 0.6, my = tip.y + Math.sin(a1) * cl * 0.6;
          setPoly(ten.claws[i], [tip.x, tip.y, mx, my, mx + Math.cos(a2) * cl * 0.5, my + Math.sin(a2) * cl * 0.5]);
        });
      }

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
    };

    // Unfold out of the pupa.
    c.emerge = (x, y, heading) => {
      c.B.x = x; c.B.y = y;
      c.V.x = c.V.y = 0;
      c.heading = c.wanderA = heading;
      grow = 0.2;
      c.visible = true;
      c.alive = true;
      c.dest = c.spot = null;
      c.nextStalk = 0;
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
      for (const t of tentacles) {
        letGo(t);
        for (const p of t.pts) { p.x += dx; p.y += dy; }
      }
    };

    c.wake = () => { c.alive = true; c.nextMood = 0; c.nextStalk = 0; c.dest = c.spot = null; };
    c.sleep = () => { c.alive = false; c.stalkUntil = 0; c.dest = c.spot = null; tentacles.forEach(letGo); };
    c.reset = () => { c.eaten = 0; c.bulges = []; tentacles.forEach(letGo); };

    c.settled = () => !c.bulges.length && grow === 1 &&
      Math.hypot(c.B.x - c.home.x, c.B.y - c.home.y) < 0.3 && Math.hypot(c.V.x, c.V.y) < 0.05;

    c.label = () => o.tentacles + ' TENTACLES / ' + c.eaten + ' EATEN';
    return c;
  }

  // ---- Snake -> pupa -> squid ----------------------------------------------
  // To the rest of the page this is one creature. Inside, it is the snake,
  // the pupa or the squid, and it hands every call to whichever form it is in.
  function makeShifter(svg) {
    const snake = makeSnake(svg, SNAKE);
    const pupa = makePupa(svg, PUPA);
    const squid = makeSquid(svg, SQUID);
    let form = snake;
    const c = { hits: snake.hits.concat(pupa.hits, squid.hits) };
    snake.owner = pupa.owner = squid.owner = c;
    for (const key of ['name', 'alive', 'mood', 'B', 'V']) {
      Object.defineProperty(c, key, { get: () => form[key] });
    }

    function toPupa(now) {
      const head = snake.body()[0];
      pupa.begin(snake.body(), head.x, head.y, snake.heading, now);
      snake.visible = false;
      snake.alive = false;
      form = pupa;
    }

    function hatch() {
      squid.emerge(pupa.B.x, pupa.B.y, pupa.heading);
      pupa.visible = false;
      pupa.alive = false;
      form = squid;
    }

    c.step = (now, env) => {
      form.step(now, env);
      if (form === snake && snake.alive && snake.eaten >= SNAKE.evolveAt) toPupa(now);
      else if (form === pupa && pupa.done(now)) hatch();
    };

    // Shortcuts for testing in the console:
    //   ERO.creatures.snake.evolve()  curls the snake into the pupa now
    //   ERO.creatures.snake.hatch()   skips straight to the squid
    c.evolve = () => {
      if (form !== snake) return;
      if (!snake.alive) snake.wake();
      toPupa(performance.now());
      kick();
    };
    c.hatch = () => {
      if (form === snake) c.evolve();
      if (form === pupa) hatch();
      kick();
    };

    c.draw = () => { snake.draw(); pupa.draw(); squid.draw(); };
    c.setHome = (x, y, scale) => { snake.setHome(x, y, scale); pupa.setHome(x, y, scale); squid.setHome(x, y, scale); };
    c.teleport = (dx, dy) => form.teleport(dx, dy);
    c.wake = () => form.wake();
    c.sleep = () => {
      if (form === pupa) hatch(); // a pupa can't walk home, so it hatches first
      form.sleep();
    };
    c.settled = () => form.settled();
    c.label = () => form.label();
    c.reset = () => {
      // PURGE: whatever it has become shrinks back into a snake and coils up.
      if (form !== snake) {
        snake.gatherAt(form.B.x, form.B.y);
        for (const f of [pupa, squid]) { f.visible = false; f.alive = false; }
        squid.sleep();
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
    evolveAt: 20,     // words eaten before it curls into the pupa
    tune: {
      cruise: 2.4, flee: 9.5, fleeRadius: 200, turn: 0.25, pauseChance: 0.05, roam: 1.4,
      lure: 1.8,        // how hard it goes for a word it is hunting
      wiggle: 0.75,     // side-to-side swing in radians
      wavelength: 150   // px travelled per full swing
    }
  };

  const PUPA = {
    duration: 10000,  // ms before it hatches
    curlSeconds: 1.2, // how long the snake takes to curl into the egg
    dots: 18,         // dots around the egg
    length: 34,       // half-length of the egg
    width: 23         // half-width of the egg
  };

  const SQUID = {
    spine: 9,         // dots along the mantle
    seg: 14,          // px between them
    width: 26,        // half-width of the mantle at its widest
    fin: 14,
    fan: 0.5,         // how much the free tentacles spread apart
    tentacles: 10,
    armLen: 26,       // dots per tentacle (about 225px)
    longLen: 40,      // the two long pincer tentacles (about 350px)
    longOnes: [3, 6],
    tseg: 9,
    claw: 12,         // pincer prong length
    armReach: 60,     // how far a free tip looks for a letter to grab
    longReach: 110,
    reachMs: 260,     // time for a tip to travel to its letter
    armHoldMs: 2500,  // how long an arm holds on (randomised)
    longHoldMs: 1000, // pincers hold this long, then eat the word
    tune: {
      cruise: 2.2, flee: 9, fleeRadius: 220, turn: 0.2, pauseChance: 0.05, roam: 1.4,
      wiggle: 0.35, wavelength: 170 // a gentler, fish-like swing
    }
  };

  ERO.makeCrawler = (svg) => makeSpider(svg, CRAWLER);
  ERO.makeStrider = (svg) => makeSpider(svg, STRIDER);
  ERO.makeSnake = (svg) => makeShifter(svg);
})();
