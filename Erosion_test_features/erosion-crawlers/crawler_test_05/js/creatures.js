/*
  EROSION.EXE: the creatures.

  Every creature has the same "brain" (steer):
  - ROAMING: it always has somewhere to go. Usually a word (which it eats on
    arrival), sometimes just a spot off to the side, so it wanders across
    the page as well as up and down it.
  - It drifts a little at random, sometimes pauses, and bolts away from
    your cursor... except now and then it gets bold, STALKS the cursor and
    lunges. If it catches it, it CLINGS to the cursor for a moment.
  - FIGHTING: when two creatures get close, one may go for the other. A bite
    tears off a leg, a tentacle or tail segments, knocks the victim away and
    makes it flicker turquoise. Flesh counts as food, just like words.
    A creature with too few parts left dies and goes back to its nest.
  - You can grab a creature and THROW it: it flies on with the speed of your
    mouse and bounces off the edges of the page.

  Every creature has a life cycle: after eating enough it curls up into a
  PUPA (a wobbling silk egg) and 10 seconds later hatches as its adult form.
  - CRAWLER -> SCORPION: soft body, legs that grip letters, grows more legs
    as it feeds. The scorpion is bigger, with pincers and a curled stinger.
  - STRIDER -> COLOSSUS: long three-jointed legs and a real spider gait.
    The colossus walks on 12 of them, with mandibles and a trailing silk thread.
  - SNAKE -> SQUID: a chain of dots with pulsing tendrils. The squid has a
    pointed mantle with jaws at the tip and 10 long tentacles that grab
    words; the two longest have pincers.

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
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
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

  // A pincer: two hooked prongs at (x, y) pointing along angle a.
  function pincer(els, x, y, a, open, len) {
    [-1, 1].forEach((side, i) => {
      const a1 = a + side * open, a2 = a - side * (open * 1.3 + 0.3);
      const mx = x + Math.cos(a1) * len * 0.6, my = y + Math.sin(a1) * len * 0.6;
      setPoly(els[i], [x, y, mx, my, mx + Math.cos(a2) * len * 0.5, my + Math.sin(a2) * len * 0.5]);
    });
  }

  // Shown hidden or visible, and flickering turquoise while hurt.
  function paint(c) {
    c.g.style.display = c.visible ? '' : 'none';
    const hurt = c.now < c.hurtUntil && Math.floor(c.now / 170) % 2 === 0;
    c.g.classList.toggle('ero-hurt', hurt);
    return c.visible;
  }

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
  function base(name, tune, svg) {
    const c = {
      name, p: tune, alive: false, visible: true, g: make(svg, 'g'),
      B: { x: 0, y: 0 }, V: { x: 0, y: 0 }, home: { x: 0, y: 0 },
      heading: -Math.PI / 2, restHeading: -Math.PI / 2,
      wanderA: Math.random() * Math.PI * 2, paused: false, nextMood: 0,
      dest: null, spot: null, destUntil: 0, surge: 1,
      stalkUntil: 0, nextStalk: 0, clingUntil: 0,
      foe: null, fightUntil: 0, nextFight: 0,
      throwV: null, hurtUntil: 0, snapUntil: 0, dead: false, immune: false,
      fear: 0, mood: 'DORMANT', travel: 0, bulges: [], nextBite: 0, eaten: 0,
      now: 0, hits: []
    };
    // Thrown by the mouse: carry on with the mouse's speed.
    c.fling = (vx, vy) => {
      const v = Math.hypot(vx, vy), k = v > 40 ? 40 / v : 1;
      c.throwV = { x: vx * k, y: vy * k };
      c.clingUntil = 0;
      c.stalkUntil = 0;
      c.foe = null;
    };
    return c;
  }

  function eat(c, w) {
    words.swallow(w);
    eatFlesh(c);
  }
  // Anything eaten (a word or a bite of another creature) counts the same.
  function eatFlesh(c) {
    c.bulges.push(0);
    c.eaten++;
    c.snapUntil = c.now + 220;
    if (c.onEat) c.onEat();
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
      c.throwV = null;
      c.mood = 'DORMANT';
      return;
    }

    const me = c.owner || c;
    const mouth = c.mouth ? c.mouth() : c.B;
    let stalking = false;

    if (env.dragged === me) {
      // Caught: hauled toward the pointer.
      c.V.x = clamp((env.ptr.x - c.B.x) * 0.18, -10, 10);
      c.V.y = clamp((env.ptr.y - c.B.y) * 0.18, -10, 10);
      c.throwV = null;
      c.clingUntil = 0;
      c.foe = null;
      c.fear = 1;
      c.mood = 'CAUGHT';
    } else if (c.throwV) {
      // Thrown: fly on, slowing down, bouncing off the edges of the page.
      const t = c.throwV;
      c.V.x = t.x; c.V.y = t.y;
      t.x *= 0.95; t.y *= 0.95;
      if ((c.B.x < 30 && t.x < 0) || (c.B.x > env.W - 30 && t.x > 0)) t.x *= -0.6;
      if ((c.B.y < 30 && t.y < 0) || (c.B.y > env.H - 30 && t.y > 0)) t.y *= -0.6;
      if (Math.hypot(t.x, t.y) < 1.2) c.throwV = null;
      c.fear = 0;
      c.mood = 'THROWN';
    } else if (env.ptr.on && now < c.clingUntil) {
      // It bit the cursor and hangs on to it for a moment.
      c.V.x = clamp((env.ptr.x - mouth.x) * 0.4, -20, 20);
      c.V.y = clamp((env.ptr.y - mouth.y) * 0.4, -20, 20);
      c.fear = 0;
      c.mood = 'CLINGING';
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

      // Fights: drop a fight that is over, or start one with a neighbour.
      const f = c.foe;
      if (f && (!f.alive || f.immune || now > c.fightUntil || dist(f.B, c.B) > 450 * s)) {
        c.foe = null;
        c.nextFight = now + 3000;
      }
      if (!c.foe && !stalking && now > c.nextFight) {
        c.nextFight = now + 1500;
        for (const o of env.creatures) {
          if (o === me || !o.alive || o.immune) continue;
          if (dist(o.B, c.B) < P.fightRange * s && Math.random() < P.aggression) {
            c.foe = o;
            c.fightUntil = now + 6000;
            break;
          }
        }
      }
      const fighting = !!c.foe && !stalking;

      c.wanderA += (Math.random() - 0.5) * P.turn;
      let dx = Math.cos(c.wanderA) * 0.6, dy = Math.sin(c.wanderA) * 0.6;

      // Head for the cursor, a foe, something it is hunting, or its destination.
      if (!stalking && !fighting && (now > c.destUntil || (c.dest && c.dest.gone) || (!c.dest && !c.spot))) pickDest(c, now, env);
      if (c.spot && dist(c.spot, c.B) < 40 * s) pickDest(c, now, env);
      const lure = !stalking && !fighting && c.lure ? c.lure(now, env) : null;
      const goal = stalking ? env.ptr : fighting ? c.foe.B : lure || (c.dest ? centre(c.dest) : c.spot);
      let goalDist = Infinity;
      if (goal) {
        const gx = goal.x - c.B.x, gy = goal.y - c.B.y;
        goalDist = Math.hypot(gx, gy) || 1;
        const pull = stalking || fighting ? 3 : P.roam;
        dx += (gx / goalDist) * pull;
        dy += (gy / goalDist) * pull;
      }

      // Soft walls at the edges of the page.
      const m = 90 * s;
      if (c.B.x < m) dx += (m - c.B.x) / m * 2.5;
      if (c.B.x > env.W - m) dx -= (c.B.x - (env.W - m)) / m * 2.5;
      if (c.B.y < m) dy += (m - c.B.y) / m * 2.5;
      if (c.B.y > env.H - m) dy -= (c.B.y - (env.H - m)) / m * 2.5;

      // Give the other creatures some room (unless it is fighting them).
      const room = 240 * s;
      for (const o of env.creatures) {
        if (o === me || o === c.foe || !o.alive) continue;
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
      if (stalking || fighting) speed = (goalDist < 170 * s ? P.flee : P.cruise * 1.6) * s * c.surge; // lunge when close
      else if (c.paused && c.fear === 0 && !lure) speed = 0;
      const accel = c.fear > 0 || stalking || fighting ? 0.25 : 0.07;
      c.V.x += ((dx / len) * speed - c.V.x) * accel;
      c.V.y += ((dy / len) * speed - c.V.y) * accel;
      c.mood = stalking ? 'STALKING' : fighting ? 'FIGHTING' : c.fear > 0.25 ? 'SPOOKED'
        : lure ? 'HUNTING' : speed === 0 ? 'LURKING' : 'ROAMING';
    }

    // Move. Snakes and squids swing side to side as they travel (by
    // distance, not time, so the wave freezes when they stop).
    let mx = c.V.x, my = c.V.y;
    const v = Math.hypot(mx, my);
    if (P.wiggle && v > 0.05 && !c.throwV) {
      c.travel += v;
      const a = Math.sin(c.travel / (P.wavelength * s) * Math.PI * 2) * P.wiggle;
      const ca = Math.cos(a), sa = Math.sin(a);
      const rx = mx * ca - my * sa;
      my = mx * sa + my * ca;
      mx = rx;
    }
    c.B.x = clamp(c.B.x + mx, 20, env.W - 20);
    c.B.y = clamp(c.B.y + my, 20, env.H - 20);
    if (v > 0.15 && !c.throwV) c.heading += wrap(Math.atan2(c.V.y, c.V.x) - c.heading) * (0.08 + c.fear * 0.12);

    // Caught the cursor: hang on to it.
    if (stalking && dist(env.ptr, mouth) < 16 * s) {
      c.stalkUntil = 0;
      c.clingUntil = now + 2000 + Math.random() * 1500;
      c.snapUntil = now + 220;
    }

    // Close enough to the foe: bite!
    if (c.foe && c.mood === 'FIGHTING' && dist(mouth, c.foe.B) < 34 * s) {
      const victim = c.foe.form || c.foe;
      if (victim.hurt) victim.hurt(now);
      const kx = c.foe.B.x - c.B.x, ky = c.foe.B.y - c.B.y;
      const kd = Math.hypot(kx, ky) || 1;
      victim.throwV = { x: (kx / kd) * 8 * s, y: (ky / kd) * 8 * s }; // knocked away
      eatFlesh(c);
      c.foe = null;
      c.nextFight = now + 2500 + Math.random() * 2500;
    }

    // Arrived at the destination word: eat it and move on.
    if (c.dest && !c.dest.gone && dist(centre(c.dest), mouth) < 16 * s) {
      eat(c, c.dest);
      c.dest = null;
    }
  }

  // Bulges: swallowed food travelling through the body (0 = mouth, 1 = tail).
  function advanceBulges(c, speed) {
    c.bulges = c.bulges.map((b) => b + speed).filter((b) => b < 1.25);
  }
  function bulgeAt(c, order) {
    let r = 0;
    for (const b of c.bulges) r += Math.exp(-(((order - b) / 0.12) ** 2));
    return r;
  }

  // ---- Spiders (crawler, strider, scorpion, colossus) ----------------------
  function makeSpider(svg, o) {
    const c = base(o.name, o.tune, svg);
    const g = c.g;
    const size = o.size || 1;
    const n = o.body.length;
    const pos = o.body.map(() => ({ x: 0, y: 0 }));
    const prev = o.body.map(() => ({ x: 0, y: 0 }));
    const edges = o.lines.concat(o.braces).map(([a, b]) => ({
      a, b, len: Math.hypot(o.body[a][0] - o.body[b][0], o.body[a][1] - o.body[b][1]) * size
    }));
    const front = Math.max(...o.body.map((p) => p[0]));
    const back = Math.min(...o.body.map((p) => p[0]));
    const gut = o.body.map(([x]) => (front - x) / (front - back));
    const claws = new Set(o.claws || []);
    let S = 1;
    c.grips = 0;
    c.legScale = 1;
    c.mouth = () => pos[0];

    // Legs first so the body is drawn on top.
    const legs = [];
    o.slots.forEach(([hipL, hipR, deg], slot) => {
      [-1, 1].forEach((side) => {
        const lg = make(g, 'g', 'ero-leg');
        const leg = {
          slot, side, hip: side < 0 ? hipL : hipR, angle: deg * Math.PI / 180,
          group: (slot + (side < 0 ? 0 : 1)) % 2, // for the alternating spider gait
          active: false, dying: false, grow: 0,
          foot: { x: 0, y: 0 }, from: { x: 0, y: 0 }, to: { x: 0, y: 0 },
          t: 1, dur: 200, word: null, gripped: false, g: lg, lines: [], dots: [],
          claw: claws.has(slot) ? [make(lg, 'polyline', 'ero-tendril ero-claw'), make(lg, 'polyline', 'ero-tendril ero-claw')] : null
        };
        for (let k = 0; k < o.segments; k++) leg.lines.push(make(lg, 'line', 'limb'));
        for (let k = 0; k < o.segments; k++) leg.dots.push(make(lg, 'circle', 'dot', { r: k === o.segments - 1 ? 2.6 : 2 }));
        legs.push(leg);
      });
    });
    const legAt = (slot, side) => legs[slot * 2 + (side < 0 ? 0 : 1)];
    const working = () => legs.filter((l) => l.active && !l.dying);

    // Optional tail: a chain hanging off a body dot (a stinger or a silk thread).
    const T = o.tail;
    const tail = T ? Array.from({ length: T.count }, () => ({ x: 0, y: 0 })) : null;
    const tailEls = T ? tail.slice(1).map(() => make(g, 'line', T.silk ? 'ero-silk' : 'limb ero-thick')) : [];
    const tailDots = T && !T.silk ? tail.map(() => make(g, 'circle', 'dot')) : [];
    const sting = T && T.stinger ? make(g, 'polyline', 'ero-tendril ero-claw') : null;

    const lineEls = o.lines.map(() => make(g, 'line', 'limb'));
    const dotEls = o.body.map(() => make(g, 'circle', 'dot', { r: o.dotR }));
    const jaws = o.mandibles ? [make(g, 'polyline', 'ero-tendril ero-claw'), make(g, 'polyline', 'ero-tendril ero-claw')] : null;
    c.hits = o.body.map(() => make(g, 'circle', 'hit', { r: 18 * size }));

    const reach = () => o.reach * S * c.legScale;
    const maxReach = () => reach() * (o.segments === 2 ? 2 * o.seg[0] : o.seg[0] + 2 * o.seg[1]);
    const wantScale = () => 1 + o.legGrowth * Math.max(0, working().length / 2 - o.startPairs);

    function bodyTarget(i) {
      const cs = Math.cos(c.heading), sn = Math.sin(c.heading);
      const [lx, ly] = o.body[i];
      return { x: c.B.x + (lx * cs - ly * sn) * S * size, y: c.B.y + (lx * sn + ly * cs) * S * size };
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

    // Grow the next missing pair of legs (also regrows legs bitten off).
    function growPair() {
      for (const slot of o.growOrder.slice(0, o.maxPairs)) {
        const missing = [legAt(slot, -1), legAt(slot, 1)].filter((l) => !l.active || l.dying);
        if (!missing.length) continue;
        missing.forEach((leg) => {
          leg.active = true;
          leg.dying = false;
          const p = idealFoot(leg);
          leg.foot.x = p.x; leg.foot.y = p.y;
          leg.t = 1;
        });
        return;
      }
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
        if (leg.grow < 1) leg.grow = Math.min(1, leg.grow + (o.unfold || 0.05));

        const ideal = idealFoot(leg);
        if (!c.alive || c.throwV) {
          // Asleep or flying through the air: legs tuck back to their rest spot.
          letGo(leg);
          leg.foot.x += (ideal.x - leg.foot.x) * (c.alive ? 0.3 : 0.09);
          leg.foot.y += (ideal.y - leg.foot.y) * (c.alive ? 0.3 : 0.09);
          leg.t = 1;
          continue;
        }

        if (leg.t < 1) {
          // Mid-step: the foot swings toward its new letter.
          leg.t = Math.min(1, leg.t + STEP / leg.dur);
          const e = smooth(leg.t);
          leg.foot.x = leg.from.x + (leg.to.x - leg.from.x) * e;
          leg.foot.y = leg.from.y + (leg.to.y - leg.from.y) * e;
          if (leg.t === 1 && leg.word && !leg.word.gone) {
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

    function updateTail(t) {
      if (!tail) return;
      const seg = T.seg * S;
      tail[0].x = pos[T.from].x; tail[0].y = pos[T.from].y;
      follow(tail, tail.length, seg);
      if (T.curl) {
        // A scorpion tail curls round in an arc instead of just trailing.
        let a = c.heading + Math.PI;
        for (let j = 1; j < tail.length; j++) {
          a += T.curl;
          tail[j].x += (tail[j - 1].x + Math.cos(a) * seg - tail[j].x) * 0.2;
          tail[j].y += (tail[j - 1].y + Math.sin(a) * seg - tail[j].y) * 0.2;
        }
        follow(tail, tail.length, seg);
      }
      if (c.alive && T.silk) {
        for (let j = 1; j < tail.length; j++) tail[j].x += Math.sin(t * 2 + j * 0.6) * 0.3 * S;
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
      if (tail) {
        const bx = -Math.cos(c.heading), by = -Math.sin(c.heading);
        tail.forEach((p, j) => { p.x = pos[T.from].x + bx * T.seg * S * j; p.y = pos[T.from].y + by * T.seg * S * j; });
      }
    }

    c.step = (now, env) => {
      S = env.scale;
      c.now = now;
      steer(c, now, env);
      c.legScale += (wantScale() - c.legScale) * 0.03;

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
      updateTail(t);

      // Snack on whatever word passes under the mouth (it needs time to chew).
      if (c.alive && now > c.nextBite) {
        const w = words.under(pos[0].x, pos[0].y, 3 * S * size);
        if (w) {
          eat(c, w);
          c.nextBite = now + o.biteGap;
        }
      }
      advanceBulges(c, 0.022);
    };

    c.draw = () => {
      if (!paint(c)) return;
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
        let last;

        if (o.segments === 2) {
          const k = knee(hp.x, hp.y, fx, fy, R * o.seg[0], px, py, lift * 7 * S);
          setLine(leg.lines[0], hp.x, hp.y, k.x, k.y);
          setLine(leg.lines[1], k.x, k.y, fx, fy);
          setDot(leg.dots[0], k.x, k.y);
          setDot(leg.dots[1], fx, fy);
          last = k;
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
          last = k2;
        }
        if (leg.claw) {
          // Pincer arm: open while reaching, shut while holding a letter.
          const open = leg.t < 1 ? 0.75 : leg.gripped ? 0.12 : 0.4;
          pincer(leg.claw, fx, fy, Math.atan2(fy - last.y, fx - last.x), open, 13 * S * gr);
        }
      }

      if (tail) {
        tailEls.forEach((el, j) => setLine(el, tail[j].x, tail[j].y, tail[j + 1].x, tail[j + 1].y));
        tailDots.forEach((el, j) => setDot(el, tail[j].x, tail[j].y, (j === tail.length - 1 ? 4 : 3 - 1.4 * j / tail.length) * S));
        if (sting) {
          const tp = tail[tail.length - 1], pr = tail[tail.length - 2];
          const a = Math.atan2(tp.y - pr.y, tp.x - pr.x), L = 9 * S;
          const mx = tp.x + Math.cos(a) * L, my = tp.y + Math.sin(a) * L;
          setPoly(sting, [tp.x, tp.y, mx, my, mx + Math.cos(a + 2.3) * L * 0.7, my + Math.sin(a + 2.3) * L * 0.7]);
        }
      }

      o.lines.forEach(([a, b], i) => setLine(lineEls[i], pos[a].x, pos[a].y, pos[b].x, pos[b].y));
      for (let i = 0; i < n; i++) {
        setDot(dotEls[i], pos[i].x, pos[i].y, o.dotR + bulgeAt(c, gut[i]) * 2.4 * size);
        setDot(c.hits[i], pos[i].x, pos[i].y);
      }

      if (jaws) {
        // Mandibles: slowly working, snapping shut when it bites.
        const open = c.now < c.snapUntil ? 0.05 : 0.35 + 0.25 * Math.sin(c.now * 0.008);
        const h = pos[0], f = c.heading, L = 11 * S * size;
        [-1, 1].forEach((side, i) => {
          const bx = h.x + Math.cos(f + side * Math.PI / 2) * 3 * S * size;
          const by = h.y + Math.sin(f + side * Math.PI / 2) * 3 * S * size;
          const a1 = f + side * open;
          const mx = bx + Math.cos(a1) * L * 0.6, my = by + Math.sin(a1) * L * 0.6;
          setPoly(jaws[i], [bx, by, mx, my, mx + Math.cos(f - side * 0.9) * L * 0.5, my + Math.sin(f - side * 0.9) * L * 0.5]);
        });
      }
    };

    c.setHome = (x, y, scale) => {
      c.home.x = x; c.home.y = y;
      S = scale;
      if (!c.alive && c.visible) {
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
      if (tail) for (const p of tail) { p.x += dx; p.y += dy; }
    };
    c.gatherAt = (x, y) => c.teleport(x - c.B.x, y - c.B.y);

    // A bite tears off a random leg. Too few legs left and it dies.
    c.hurt = (now) => {
      c.hurtUntil = now + 900;
      const left = working();
      const leg = left[Math.floor(Math.random() * left.length)];
      if (leg) { letGo(leg); leg.dying = true; }
      if (left.length - 1 < 2) c.dead = true;
    };

    c.wake = () => { c.alive = true; c.nextMood = 0; c.nextStalk = 0; c.dest = c.spot = null; };
    c.sleep = () => { c.alive = false; c.stalkUntil = c.clingUntil = 0; c.foe = null; c.dest = c.spot = null; legs.forEach(letGo); };

    // Hatch out of a pupa: the legs unfold from nothing.
    c.emerge = (x, y, heading) => {
      c.B.x = x; c.B.y = y;
      c.V.x = c.V.y = 0;
      c.heading = c.wanderA = heading;
      Object.assign(c, { visible: true, alive: true, dead: false, dest: null, spot: null, nextStalk: 0, eaten: 0, grips: 0, bulges: [] });
      const keep = new Set(o.growOrder.slice(0, o.startPairs));
      legs.forEach((leg) => {
        letGo(leg);
        leg.active = keep.has(leg.slot);
        leg.dying = false;
        leg.grow = 0;
        leg.t = 1;
      });
      placeAtRest();
    };

    c.reset = () => {
      // Back to the starting legs: lost ones regrow, extra ones wither.
      const keep = new Set(o.growOrder.slice(0, o.startPairs));
      legs.forEach((leg) => {
        if (keep.has(leg.slot)) {
          if (!leg.active || leg.dying) {
            leg.active = true;
            leg.dying = false;
            const p = idealFoot(leg);
            leg.foot.x = p.x; leg.foot.y = p.y;
            leg.t = 1;
          }
        } else if (leg.active) {
          leg.dying = true;
        }
      });
      Object.assign(c, { grips: 0, eaten: 0, bulges: [], dead: false, foe: null, throwV: null, clingUntil: 0 });
    };

    c.settled = () => {
      if (c.bulges.length || c.now < c.hurtUntil) return false;
      if (Math.hypot(c.B.x - c.home.x, c.B.y - c.home.y) > 0.3) return false;
      if (Math.abs(wrap(c.heading - c.restHeading)) > 0.005) return false;
      if (Math.abs(c.legScale - wantScale()) > 0.002) return false;
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

    c.body = () => pos.concat(working().map((l) => l.foot));
    c.label = () => {
      const count = working().length + (o.claws ? ' LIMBS' : ' LEGS');
      return o.evolveAt ? count + ' / ' + Math.max(0, o.evolveAt - c.eaten) + ' TO PUPA' : count + ' / ' + c.eaten + ' EATEN';
    };

    for (let i = 0; i < o.startPairs; i++) growPair();
    legs.forEach((leg) => { if (leg.active) leg.grow = 1; });
    return c;
  }

  // ---- Snake ---------------------------------------------------------------
  function makeSnake(svg, o) {
    const c = base('SNAKE', o.tune, svg);
    const g = c.g;
    let S = 1;
    let len = o.startLen;
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
      if (target && !target.gone && dist(centre(target), pts[0]) < 14 * S) {
        eat(c, target);
        target = null;
      }
      advanceBulges(c, 0.012);
    };

    c.draw = () => {
      if (!paint(c)) return;
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

    // Coming back from pupa or squid: start as a knot where it is.
    c.gatherAt = (x, y) => {
      for (const p of pts) { p.x = x; p.y = y; }
      c.B.x = x; c.B.y = y;
    };

    c.teleport = (dx, dy) => {
      c.B.x += dx; c.B.y += dy;
      for (const p of pts) { p.x += dx; p.y += dy; }
    };

    // A bite takes two segments off the tail. Too short and it dies.
    c.hurt = (now) => {
      c.hurtUntil = now + 900;
      len = Math.max(o.minLen, len - 2);
      if (len <= o.minLen) c.dead = true;
    };

    c.wake = () => {
      c.alive = true;
      c.nextMood = 0;
      c.nextStalk = 0;
      c.dest = c.spot = null;
      c.heading = c.wanderA = Math.random() * Math.PI * 2;
    };
    c.sleep = () => { c.alive = false; c.stalkUntil = c.clingUntil = 0; c.foe = null; c.dest = c.spot = null; target = null; };
    c.reset = () => {
      len = o.startLen;
      target = null;
      Object.assign(c, { eaten: 0, bulges: [], dead: false, throwV: null, clingUntil: 0 });
    };

    c.settled = () => {
      if (c.bulges.length || c.now < c.hurtUntil) return false;
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
  // The young creature curls into an egg wrapped in silk threads. It cannot
  // move and cannot be bitten.
  function makePupa(svg, o) {
    const c = base('PUPA', {}, svg);
    const g = c.g;
    let S = 1;
    let startAt = 0;
    const K = o.dots;
    const from = Array.from({ length: K }, () => ({ x: 0, y: 0 }));
    const pts = Array.from({ length: K }, () => ({ x: 0, y: 0 }));
    // Silk threads cross the egg; the outline goes on top.
    const threads = [];
    for (let i = 0; i < K; i += 2) threads.push({ a: i, b: (i + Math.round(K / 3)) % K, el: make(g, 'line', 'ero-silk') });
    const outline = pts.map(() => make(g, 'line', 'limb ero-thick'));
    const dotEls = pts.map(() => make(g, 'circle', 'dot'));
    c.hits = pts.map(() => make(g, 'circle', 'hit', { r: 16 }));
    c.visible = false;
    c.immune = true;

    // Begin: the creature's dots slide into an egg shape where it stands.
    c.begin = (body, x, y, heading, now) => {
      for (let i = 0; i < K; i++) {
        const p = body[Math.round(i / (K - 1) * (body.length - 1))];
        from[i].x = pts[i].x = p.x;
        from[i].y = pts[i].y = p.y;
      }
      c.B.x = x; c.B.y = y;
      c.heading = heading;
      startAt = now;
      c.now = now;
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
      if (!paint(c)) return;
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
    c.fling = () => {}; // too heavy to throw
    c.wake = () => {};
    c.sleep = () => {};
    c.reset = () => {};
    c.settled = () => false;
    c.label = () => 'HATCHES IN ' + Math.max(0, Math.ceil((o.duration - (c.now - startAt)) / 1000)) + 'S';
    return c;
  }

  // ---- Squid ---------------------------------------------------------------
  function makeSquid(svg, o) {
    const c = base('SQUID', o.tune, svg);
    const g = c.g;
    let S = 1;
    let grow = 1;   // 0..1 while it unfolds out of the pupa
    let jet = 0;    // phase of the swimming pulse
    c.jaw = 0;      // 0 = mouth shut, 1 = wide open
    const N = o.spine;
    const spine = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
    const norms = spine.map(() => ({ x: 0, y: 0 }));
    c.mouth = () => spine[0];

    // Tentacles: long little snakes trailing from the back. Two are longer
    // still and end in a pincer.
    const tentacles = [];
    for (let k = 0; k < o.tentacles; k++) {
      const long = o.longOnes.includes(k);
      const tg = make(g, 'g');
      const pts = Array.from({ length: long ? o.longLen : o.armLen }, () => ({ x: 0, y: 0 }));
      tentacles.push({
        k, long, pts, g: tg, grip: null, nextTry: 0, lost: false,
        lines: pts.slice(1).map(() => make(tg, 'line', 'limb')),
        dots: pts.map(() => make(tg, 'circle', 'dot')),
        claws: long ? [make(tg, 'polyline', 'ero-tendril ero-claw'), make(tg, 'polyline', 'ero-tendril ero-claw')] : null
      });
    }
    const leftEls = spine.slice(1).map(() => make(g, 'line', 'limb ero-thick'));
    const rightEls = spine.slice(1).map(() => make(g, 'line', 'limb ero-thick'));
    const backLine = make(g, 'line', 'limb ero-thick');
    const jawIn = [make(g, 'line', 'limb'), make(g, 'line', 'limb')];
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

    function forward() {
      const dx = spine[0].x - spine[1].x, dy = spine[0].y - spine[1].y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: dx / d, y: dy / d };
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
        if (stretched || now > gp.until || gp.word.gone || !c.alive || c.throwV) {
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
      if (grow === 1 && !c.throwV && now > ten.nextTry) {
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
      tentacles.forEach((ten, k) => { if (!ten.lost) updateTentacle(ten, an[k], now, t); });

      // The mouth at the tip opens when food is near and snaps shut on it.
      const f = forward();
      const mx = spine[0].x + f.x * 4 * S, my = spine[0].y + f.y * 4 * S;
      let want = 0.12;
      if (c.alive && (words.under(mx + f.x * 22 * S, my + f.y * 22 * S, 14 * S) ||
          c.mood === 'STALKING' || (c.foe && dist(c.foe.B, c.B) < 140 * S))) want = 1;
      if (now < c.snapUntil) want = 0;
      c.jaw += (want - c.jaw) * 0.18;
      if (c.alive && c.jaw > 0.6 && now > c.nextBite) {
        const w = words.under(mx, my, 6 * S);
        if (w) { eat(c, w); c.nextBite = now + o.mouthGap; }
      }
      advanceBulges(c, 0.02);
    };

    c.draw = () => {
      if (!paint(c)) return;
      const pulse = c.alive ? Math.max(0, Math.sin(jet)) : 0;
      const L = [], R = [];
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const w = (width(u) * (1 - 0.15 * pulse) * grow + bulgeAt(c, u) * 4) * S;
        L.push({ x: spine[i].x + norms[i].x * w, y: spine[i].y + norms[i].y * w });
        R.push({ x: spine[i].x - norms[i].x * w, y: spine[i].y - norms[i].y * w });
      }

      for (const ten of tentacles) {
        ten.g.style.display = ten.lost ? 'none' : '';
        if (ten.lost) continue;
        const m = ten.pts.length;
        ten.lines.forEach((el, j) => setLine(el, ten.pts[j].x, ten.pts[j].y, ten.pts[j + 1].x, ten.pts[j + 1].y));
        ten.dots.forEach((el, j) => setDot(el, ten.pts[j].x, ten.pts[j].y, (2.4 - 1.5 * j / (m - 1)) * S * grow));
        if (!ten.claws) continue;
        // Pincer: wide open while reaching, shut when holding, slowly
        // snapping while it waits.
        const tip = ten.pts[m - 1], pre = ten.pts[m - 2];
        const open = ten.grip ? (ten.grip.held ? 0.12 : 0.75) : 0.35 + 0.2 * Math.sin(c.now * 0.006 + ten.k);
        pincer(ten.claws, tip.x, tip.y, Math.atan2(tip.y - pre.y, tip.x - pre.x), open, o.claw * S * grow);
      }

      // Mantle sides. The first piece of each side runs to a jaw at the tip.
      const f = forward(), n0 = norms[0];
      const jl = o.jaw * S * grow, op = 0.25 + c.jaw;
      const up = { x: spine[0].x + f.x * jl * 0.5 + n0.x * op * jl * 0.6, y: spine[0].y + f.y * jl * 0.5 + n0.y * op * jl * 0.6 };
      const dn = { x: spine[0].x + f.x * jl * 0.5 - n0.x * op * jl * 0.6, y: spine[0].y + f.y * jl * 0.5 - n0.y * op * jl * 0.6 };
      const throat = { x: spine[0].x - f.x * jl * 0.4, y: spine[0].y - f.y * jl * 0.4 };
      setLine(leftEls[0], L[1].x, L[1].y, up.x, up.y);
      setLine(rightEls[0], R[1].x, R[1].y, dn.x, dn.y);
      setLine(jawIn[0], up.x, up.y, throat.x, throat.y);
      setLine(jawIn[1], dn.x, dn.y, throat.x, throat.y);
      for (let i = 1; i < N - 1; i++) {
        setLine(leftEls[i], L[i].x, L[i].y, L[i + 1].x, L[i + 1].y);
        setLine(rightEls[i], R[i].x, R[i].y, R[i + 1].x, R[i + 1].y);
      }
      setLine(backLine, L[N - 1].x, L[N - 1].y, R[N - 1].x, R[N - 1].y);

      setDot(outlineDots[0], up.x, up.y, 2.4 * S);
      setDot(outlineDots[1], dn.x, dn.y, 2.4 * S);
      for (let i = 1; i < N; i++) {
        setDot(outlineDots[i * 2], L[i].x, L[i].y, 2 * S);
        setDot(outlineDots[i * 2 + 1], R[i].x, R[i].y, 2 * S);
      }
      for (let i = 0; i < N; i++) setDot(c.hits[i], spine[i].x, spine[i].y);
    };

    // Unfold out of the pupa.
    c.emerge = (x, y, heading) => {
      c.B.x = x; c.B.y = y;
      c.V.x = c.V.y = 0;
      c.heading = c.wanderA = heading;
      grow = 0.2;
      Object.assign(c, { visible: true, alive: true, dead: false, dest: null, spot: null, nextStalk: 0, eaten: 0, bulges: [] });
      tentacles.forEach((t) => { t.lost = false; });
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

    // A bite tears off a tentacle. Down to two and it dies.
    c.hurt = (now) => {
      c.hurtUntil = now + 900;
      const left = tentacles.filter((t) => !t.lost);
      const t = left[Math.floor(Math.random() * left.length)];
      if (t) { letGo(t); t.lost = true; }
      if (left.length - 1 < 3) c.dead = true;
    };

    c.wake = () => { c.alive = true; c.nextMood = 0; c.nextStalk = 0; c.dest = c.spot = null; };
    c.sleep = () => {
      c.alive = false;
      c.stalkUntil = c.clingUntil = 0;
      c.foe = null;
      c.dest = c.spot = null;
      tentacles.forEach(letGo);
    };
    c.reset = () => {
      tentacles.forEach((t) => { letGo(t); t.lost = false; });
      Object.assign(c, { eaten: 0, bulges: [], dead: false, throwV: null, clingUntil: 0 });
    };

    c.settled = () => !c.bulges.length && grow === 1 && c.now >= c.hurtUntil &&
      Math.hypot(c.B.x - c.home.x, c.B.y - c.home.y) < 0.3 && Math.hypot(c.V.x, c.V.y) < 0.05;

    c.label = () => tentacles.filter((t) => !t.lost).length + ' TENTACLES / ' + c.eaten + ' EATEN';
    return c;
  }

  // ---- Life cycle: young -> pupa -> adult ----------------------------------
  // To the rest of the page this is one creature. Inside, it is the young
  // form, the pupa or the adult, and it hands every call to whichever form it
  // is in right now.
  function makeLifeCycle(svg, young, adult, evolveAt) {
    const pupa = makePupa(svg, PUPA);
    adult.visible = false;
    let form = young;
    const c = { hits: young.hits.concat(pupa.hits, adult.hits) };
    young.owner = pupa.owner = adult.owner = c;
    for (const key of ['name', 'alive', 'mood', 'B', 'V', 'immune']) {
      Object.defineProperty(c, key, { get: () => form[key] });
    }
    Object.defineProperty(c, 'form', { get: () => form });

    function toPupa(now) {
      pupa.begin(young.body(), young.B.x, young.B.y, young.heading, now);
      young.sleep();
      young.visible = false;
      form = pupa;
    }

    function hatch() {
      adult.emerge(pupa.B.x, pupa.B.y, pupa.heading);
      pupa.visible = false;
      pupa.alive = false;
      form = adult;
    }

    // Whatever it has become shrinks back into the young form, asleep.
    function backToYoung() {
      if (form !== young) {
        young.gatherAt(form.B.x, form.B.y);
        adult.sleep();
        for (const f of [pupa, adult]) { f.visible = false; f.alive = false; }
        young.visible = true;
        form = young;
      }
      young.sleep();
      young.reset();
      adult.reset();
    }

    c.step = (now, env) => {
      form.step(now, env);
      if (form.dead) {
        // Killed in a fight: it flickers and crawls home as its young form.
        backToYoung();
        young.hurtUntil = now + 1200;
      } else if (form === young && young.alive && young.eaten >= evolveAt) {
        toPupa(now);
      } else if (form === pupa && pupa.done(now)) {
        hatch();
      }
    };

    // Shortcuts for testing in the console, for example:
    //   ERO.creatures.snake.evolve()  curls up into the pupa now
    //   ERO.creatures.snake.hatch()   skips straight to the adult
    c.evolve = () => {
      if (form !== young) return;
      if (!young.alive) young.wake();
      toPupa(performance.now());
      kick();
    };
    c.hatch = () => {
      if (form === young) c.evolve();
      if (form === pupa) hatch();
      kick();
    };

    c.draw = () => { young.draw(); pupa.draw(); adult.draw(); };
    c.setHome = (x, y, scale) => { young.setHome(x, y, scale); pupa.setHome(x, y, scale); adult.setHome(x, y, scale); };
    c.teleport = (dx, dy) => form.teleport(dx, dy);
    c.fling = (vx, vy) => form.fling(vx, vy);
    c.wake = () => form.wake();
    c.sleep = () => {
      if (form === pupa) hatch(); // a pupa can't walk home, so it hatches first
      form.sleep();
    };
    c.settled = () => form.settled();
    c.label = () => form.label();
    c.reset = backToYoung; // PURGE
    if (young.grow) c.grow = young.grow;
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
    evolveAt: 20,            // food eaten before it curls into a pupa
    tune: { cruise: 1.5, flee: 7.5, fleeRadius: 190, turn: 0.3, pauseChance: 0.12, roam: 1.4, fightRange: 260, aggression: 0.3 }
  };

  // The crawler's adult form: bigger, with pincers and a curled stinger tail.
  const SCORPION = {
    name: 'SCORPION',
    size: 1.35,
    body: [
      [30, 0], [22, -9], [22, 9], [10, -14], [10, 14], [-4, -15],
      [-4, 15], [-16, -13], [-16, 13], [-26, -9], [-26, 9], [-34, 0]
    ],
    lines: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [3, 5], [4, 6], [5, 6], [5, 7], [6, 8], [7, 8], [7, 9], [8, 10], [9, 10], [9, 11], [10, 11]],
    braces: [[0, 3], [0, 4], [3, 6], [4, 5], [5, 8], [6, 7], [7, 10], [8, 9], [1, 4], [2, 3]],
    // Slot 0 is the pair of pincer arms reaching forward.
    slots: [[1, 2, 24], [3, 4, 72], [5, 6, 96], [7, 8, 118], [9, 10, 140]],
    claws: [0],
    growOrder: [0, 1, 2, 3, 4],
    startPairs: 5,
    maxPairs: 5,
    gripsPerPair: 0,
    legGrowth: 0,
    segments: 2,
    seg: [0.78],
    reach: 92,
    gait: 'neighbour',
    stepMs: 220, minStepMs: 70,
    damping: 0.88, spring: 0.14, stiff: 0.4, iterations: 2, breathe: 0.25,
    dotR: 3.8,
    biteGap: 600,
    unfold: 0.02,            // legs unfold slowly when it hatches
    tail: { from: 11, count: 10, seg: 11, curl: 0.3, stinger: true },
    tune: { cruise: 1.8, flee: 7, fleeRadius: 160, turn: 0.25, pauseChance: 0.1, roam: 1.4, fightRange: 300, aggression: 0.5 }
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
    evolveAt: 16,
    tune: { cruise: 1.8, flee: 8, fleeRadius: 210, turn: 0.22, pauseChance: 0.15, roam: 1.4, fightRange: 260, aggression: 0.25 }
  };

  // The strider's adult form: a giant on 12 jointed legs, with mandibles and
  // a silk thread trailing from its abdomen.
  const COLOSSUS = {
    name: 'COLOSSUS',
    size: 1.6,
    body: [
      [14, 0], [9, -7], [9, 7], [1, -9], [1, 9], [-7, -7],
      [-7, 7], [-11, 0], [-20, -10], [-20, 10], [-34, 0]
    ],
    lines: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 7], [7, 8], [7, 9], [8, 10], [9, 10], [8, 9]],
    braces: [[0, 3], [0, 4], [1, 2], [3, 4], [5, 6], [1, 5], [2, 6], [3, 6], [4, 5], [7, 10], [0, 7]],
    slots: [[1, 2, 34], [1, 2, 56], [3, 4, 78], [3, 4, 100], [5, 6, 122], [5, 6, 146]],
    growOrder: [0, 1, 2, 3, 4, 5],
    startPairs: 6,
    maxPairs: 6,
    gripsPerPair: 0,
    legGrowth: 0,
    segments: 3,
    seg: [0.5, 0.55],
    thighAngle: 1.05,
    reach: 135,
    gait: 'tetrapod',
    stepMs: 280, minStepMs: 100,
    damping: 0.88, spring: 0.14, stiff: 0.4, iterations: 2, breathe: 0.2,
    dotR: 3.6,
    biteGap: 900,
    unfold: 0.015,
    mandibles: true,
    tail: { from: 10, count: 16, seg: 10, silk: true },
    tune: { cruise: 2.1, flee: 8, fleeRadius: 170, turn: 0.2, pauseChance: 0.12, roam: 1.4, fightRange: 320, aggression: 0.45 }
  };

  const SNAKE = {
    maxLen: 44,
    startLen: 18,
    minLen: 6,        // bitten down to this many segments, it dies
    seg: 13,          // px between dots
    headR: 5.2, bodyR: 4.4, tailR: 2.2,
    coilGap: 14,      // px between the rings of the sleeping coil
    growEvery: 2,     // food eaten per new segment
    digestMs: 900,    // pause after eating before it hunts again
    evolveAt: 20,     // food eaten before it curls into the pupa
    tune: {
      cruise: 2.4, flee: 9.5, fleeRadius: 200, turn: 0.25, pauseChance: 0.05, roam: 1.4,
      fightRange: 260, aggression: 0.35,
      lure: 1.8,        // how hard it goes for a word it is hunting
      wiggle: 0.75,     // side-to-side swing in radians
      wavelength: 150   // px travelled per full swing
    }
  };

  const PUPA = {
    duration: 10000,  // ms before it hatches
    curlSeconds: 1.2, // how long the young form takes to curl into the egg
    dots: 18,         // dots around the egg
    length: 34,       // half-length of the egg
    width: 23         // half-width of the egg
  };

  const SQUID = {
    spine: 9,         // dots along the mantle
    seg: 14,          // px between them
    width: 26,        // half-width of the mantle at its widest
    jaw: 16,          // size of the mouth at the tip
    mouthGap: 600,    // ms between bites of the mouth
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
      fightRange: 300, aggression: 0.45,
      wiggle: 0.35, wavelength: 170 // a gentler, fish-like swing
    }
  };

  ERO.makeCrawler = (svg) => makeLifeCycle(svg, makeSpider(svg, CRAWLER), makeSpider(svg, SCORPION), CRAWLER.evolveAt);
  ERO.makeStrider = (svg) => makeLifeCycle(svg, makeSpider(svg, STRIDER), makeSpider(svg, COLOSSUS), STRIDER.evolveAt);
  ERO.makeSnake = (svg) => makeLifeCycle(svg, makeSnake(svg, SNAKE), makeSquid(svg, SQUID), SNAKE.evolveAt);
})();
