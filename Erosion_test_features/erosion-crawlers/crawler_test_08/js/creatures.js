/*
  EROSION.EXE demo 08: the creatures.

  Demo 08 adds ZAP: a visitor double-clicks a creature to damage it. The
  part nearest the click falls off (as in a bite) and only the parts close
  to the hit turn turquoise for a moment, instead of the whole body.

  Every creature has the same "brain" (steer):
  - ROAMING: it always has somewhere to go. Usually a word (which it eats on
    arrival), sometimes just a spot off to the side, and now and then a LINK:
    it crawls into the link and comes out where the link points to.
  - It drifts a little at random, sometimes pauses, and bolts away from
    your cursor... except now and then it gets bold, STALKS the cursor and
    lunges. If it catches it, it CLINGS to the cursor for a moment.
  - FIGHTING: when two creatures get close, one may go for the other and
    bite through one part of it. Severed pieces fall off as DEBRIS, and
    debris is food: others come to eat it. Pupas can be bitten too.
  - DEATH: a creature too broken falls apart. Its pieces spread out, can be
    eaten, and fade away after 5 seconds. Later it hatches again, out of a
    word somewhere on the page.
  - MOVING WORDS: sometimes it keeps a word it swallowed and drops it into
    the scar of another eaten word, somewhere else on the page.
  - FONDNESS: stay near a creature (or hold it gently) and it grows fond of
    you. Throwing it undoes that. A fond creature follows your cursor,
    brings you words as gifts and attacks creatures that come near you.
  - You can grab a creature and THROW it: it flies on with the speed of your
    mouse and bounces off the edges of the page.

  Life cycle: five forms, with a PUPA (a wobbling silk egg) between each.
  - CRAWLER -> SCORPION -> EMPEROR -> WARLORD -> THRONE
  - STRIDER -> COLOSSUS -> BROODMOTHER -> WEAVER -> CATHEDRAL
  - SNAKE   -> SQUID    -> OLD ONE     -> LEVIATHAN -> ABYSS
  A fifth form that has eaten enough SPLITS: it dies, and two small MUTANTS
  crawl out of it. Mutants are glyph creatures (RIBS, BRACE, QUILL, from the
  crawl_33, 38 and 39 designs) with five levels of their own, and they can
  split again at level 5. Mutants also hatch out of words now and then.

  Swallowing marks a word with a CSS class (it fades out) and sends a bulge
  through the creature's body. The real text is never changed.
*/
(() => {
  'use strict';

  const ERO = window.ERO;
  const words = ERO.words;
  const NS = 'http://www.w3.org/2000/svg';
  const STEP = 1000 / 60;
  const DEBRIS_MS = 2400; // how long a bitten-off piece lingers
  const CORPSE_MS = 5000; // how long the pieces of a dead creature last
  const HATCH_MS = 1300;  // how long a word cracks before something hatches
  const CARRY_CHANCE = 0.12; // chance it keeps a word it swallows, to drop elsewhere
  const LINK_CHANCE = 0.07;  // chance its next trip is into a link
  const FOND_MS = 12000;     // time near you before it is fully fond of you

  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const centre = (w) => ({ x: w.x + w.w / 2, y: w.y + w.h * 0.55 });
  const smooth = (t) => t * t * (3 - 2 * t);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const kick = () => { if (ERO.start) ERO.start(); }; // make sure the loop runs

  // Distance from point p to the line segment a-b.
  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
  }

  // ---- SVG helpers ---------------------------------------------------------
  let svgRoot = null;
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
    if (r !== undefined) el.setAttribute('r', Math.max(0, r).toFixed(2));
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
    if (c.zap) { zapPaint(c); return c.visible; }
    const hurt = c.now < c.hurtUntil && Math.floor(c.now / 170) % 2 === 0;
    c.g.classList.toggle('ero-hurt', hurt);
    return c.visible;
  }

  // Zapped by a visitor: only the lines, dots and letters near the hit turn
  // turquoise (class ero-zap). The hit point moves along with the body.
  const ZAP_MS = 1400;
  const ZAP_R = 42;
  function zapPaint(c) {
    const z = c.zap;
    const done = !c.visible || c.now > z.until;
    const px = c.B.x + z.dx, py = c.B.y + z.dy;
    c.g.classList.remove('ero-hurt');
    for (const el of c.g.querySelectorAll('polyline, line, path, polygon, circle:not(.hit), ellipse, text')) {
      let near = false;
      if (!done && el.style.display !== 'none') {
        try {
          const b = el.getBBox();
          const dx = Math.max(b.x - px, 0, px - b.x - b.width);
          const dy = Math.max(b.y - py, 0, py - b.y - b.height);
          near = dx * dx + dy * dy < ZAP_R * ZAP_R;
        } catch (_) { /* not drawn yet */ }
      }
      el.classList.toggle('ero-zap', near);
    }
    if (done) c.zap = null;
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

  // ---- Debris: severed limbs and broken bodies ------------------------------
  // A piece is a copy of some points that tumbles away and slows down. Every
  // piece is food: a creature nearby may come and eat it before it fades.
  let fxLayer = null;
  const debris = [];
  function layer() {
    if (!fxLayer) fxLayer = make(svgRoot, 'g');
    return fxLayer;
  }

  // life: how long the piece lasts in ms. It only fades in its last stretch.
  function spawnDebris(points, from, now, speed, life) {
    if (!svgRoot || points.length < 2) return;
    let cx = 0, cy = 0;
    points.forEach((p) => { cx += p.x; cy += p.y; });
    cx /= points.length; cy /= points.length;
    const dx = cx - from.x, dy = cy - from.y, d = Math.hypot(dx, dy) || 1;
    const sp = speed * (0.6 + Math.random() * 0.8);
    const g = layer();
    debris.push({
      pts: points.map((p) => ({ x: p.x, y: p.y })),
      vx: (dx / d) * sp + (Math.random() - 0.5) * 1.5,
      vy: (dy / d) * sp + (Math.random() - 0.5) * 1.5,
      spin: (Math.random() - 0.5) * 0.12,
      born: now,
      life: life || DEBRIS_MS * (0.7 + Math.random() * 0.6),
      el: make(g, 'polyline', 'limb ero-piece'),
      dots: points.length <= 8 ? points.map(() => make(g, 'circle', 'dot ero-piece')) : []
    });
    while (debris.length > 400) removePiece(0); // keep it light
  }

  function removePiece(i) {
    const d = debris[i];
    d.el.remove();
    d.dots.forEach((e) => e.remove());
    debris.splice(i, 1);
  }

  function pieceCentre(d) {
    let cx = 0, cy = 0;
    d.pts.forEach((p) => { cx += p.x; cy += p.y; });
    return { x: cx / d.pts.length, y: cy / d.pts.length };
  }

  // A creature that dies falls apart into pieces of whatever is drawn. The
  // pieces spread out and fade away after CORPSE_MS (5 seconds).
  function shatter(c, now) {
    const pieces = [];
    c.g.querySelectorAll('line, polyline').forEach((el) => {
      if (el.closest('[visibility="hidden"]') || el.closest('[style*="none"]')) return;
      if (el.tagName === 'line') {
        pieces.push([
          { x: +el.getAttribute('x1'), y: +el.getAttribute('y1') },
          { x: +el.getAttribute('x2'), y: +el.getAttribute('y2') }
        ]);
      } else {
        const v = (el.getAttribute('points') || '').trim().split(/\s+/).map(Number);
        const pts = [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push({ x: v[i], y: v[i + 1] });
        if (pts.length > 1) pieces.push(pts);
      }
    });
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    pieces.slice(0, 150).forEach((p) => spawnDebris(p, c.B, now, 3.2, CORPSE_MS));
    // Glyph bodies break into their characters too.
    c.g.querySelectorAll('text').forEach((el, i) => {
      if (i > 60 || el.closest('[visibility="hidden"]') || el.closest('[style*="none"]')) return;
      if (el.getAttribute('visibility') === 'hidden') return;
      const x = +el.getAttribute('x'), y = +el.getAttribute('y');
      spawnLetter(el.textContent, x, y, null, now, CORPSE_MS, c.B);
    });
  }

  // ---- Loose letters: hatching, broken glyph bodies --------------------------
  const letters = [];
  function spawnLetter(ch, x, y, to, now, life, from) {
    if (!svgRoot || !ch.trim()) return;
    const el = make(layer(), 'text', 'ero-letter');
    el.textContent = ch;
    const a = from ? Math.atan2(y - from.y, x - from.x) + (Math.random() - 0.5) : Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 2.5;
    letters.push({
      el, x, y, to, born: now, life,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (to ? 1.5 : 0),
      rot: 0, vr: (Math.random() - 0.5) * 8
    });
    while (letters.length > 300) { letters[0].el.remove(); letters.shift(); }
  }

  // ---- Hatching: a word cracks open and its letters become a creature -------
  const hatches = [];
  function startHatch(w, now, done) {
    words.crack(w);
    hatches.push({ w, at: now + HATCH_MS, done });
    kick();
  }

  // ---- Dropped words and gifts ----------------------------------------------
  // Words a creature carried off and put down somewhere else. They are drawn
  // on the creature layer, so the real text of the page is never changed.
  const drops = [];
  function dropWord(text, x, y, gift) {
    const el = make(layer(), 'text', gift ? 'ero-gift' : 'ero-dropped', { x: x.toFixed(1), y: y.toFixed(1) });
    el.textContent = text;
    drops.push(el);
    while (drops.length > 80) drops.shift().remove();
  }

  const fadeOf = (age, life) => {
    const f = Math.min(1500, life * 0.6);
    return clamp((life - age) / f, 0, 1);
  };

  // A visitor double-clicked creature c at p: the part closest to p comes
  // off and the parts around it turn turquoise. Hurting it also costs
  // fondness. Returns false if there was nothing to hit.
  ERO.zap = (c, p, now) => {
    const f = c.form || c;
    if (!f.hurt || !f.visible || f.dead) return false;
    f.hurt(now, p);
    f.zap = { dx: p.x - f.B.x, dy: p.y - f.B.y, until: now + ZAP_MS };
    c.fond = Math.max(0, (c.fond || 0) - 0.5);
    if (c.fond < 0.3) c.fondOn = false;
    kick();
    return true;
  };

  ERO.debris = {
    step(now) {
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        if (now - d.born > d.life) { removePiece(i); continue; }
        const { x: cx, y: cy } = pieceCentre(d);
        const cs = Math.cos(d.spin), sn = Math.sin(d.spin);
        d.pts.forEach((p) => {
          const rx = p.x - cx, ry = p.y - cy;
          p.x = cx + rx * cs - ry * sn + d.vx;
          p.y = cy + rx * sn + ry * cs + d.vy;
        });
        d.vx *= 0.92; d.vy *= 0.92; d.spin *= 0.96;
      }
      for (let i = letters.length - 1; i >= 0; i--) {
        const l = letters[i];
        if (now - l.born > l.life) { l.el.remove(); letters.splice(i, 1); continue; }
        l.x += l.vx; l.y += l.vy; l.rot += l.vr;
        l.vx *= 0.9; l.vy *= 0.9; l.vr *= 0.95;
        if (l.to) { l.x += (l.to.x - l.x) * 0.08; l.y += (l.to.y - l.y) * 0.08; }
      }
      for (let i = hatches.length - 1; i >= 0; i--) {
        const h = hatches[i];
        if (now < h.at) continue;
        hatches.splice(i, 1);
        const w = h.w, at = centre(w);
        words.hatched(w);
        // Each letter jumps out of the word and is pulled into the new body.
        for (let k = 0; k < w.len; k++) {
          spawnLetter(w.text[k] || '', w.x + (k + 0.5) * w.w / w.len, w.y + w.h * 0.78, at, now, 900);
        }
        h.done(at.x, at.y, now);
      }
    },
    draw(now) {
      for (const d of debris) {
        const age = now - d.born;
        const fade = fadeOf(age, d.life).toFixed(2);
        const hurt = age < 700 && Math.floor(age / 170) % 2 === 0;
        setPoly(d.el, d.pts.flatMap((p) => [p.x, p.y]));
        d.el.setAttribute('opacity', fade);
        d.el.classList.toggle('ero-hurt', hurt);
        d.dots.forEach((el, i) => {
          setDot(el, d.pts[i].x, d.pts[i].y, 1.8);
          el.setAttribute('opacity', fade);
          el.classList.toggle('ero-hurt', hurt);
        });
      }
      for (const l of letters) {
        l.el.setAttribute('x', l.x.toFixed(1));
        l.el.setAttribute('y', l.y.toFixed(1));
        l.el.setAttribute('transform', 'rotate(' + l.rot.toFixed(0) + ' ' + l.x.toFixed(1) + ' ' + l.y.toFixed(1) + ')');
        l.el.setAttribute('opacity', fadeOf(now - l.born, l.life).toFixed(2));
      }
    },
    // The nearest piece of food within r of p (pieces need a moment to land).
    near(p, r, now) {
      let best = null, bd = r;
      for (const d of debris) {
        if (now - d.born < 250) continue;
        const q = pieceCentre(d), dd = dist(p, q);
        if (dd < bd) { bd = dd; best = { piece: d, x: q.x, y: q.y }; }
      }
      return best;
    },
    eat(piece) {
      const i = debris.indexOf(piece);
      if (i >= 0) removePiece(i);
    },
    clearDrops() { drops.splice(0).forEach((el) => el.remove()); },
    hatch: startHatch,
    get hatching() { return hatches.length; },
    get active() { return debris.length > 0 || letters.length > 0 || hatches.length > 0; },
    get count() { return debris.length; }, // pieces lying on the page
  };

  // ---- Shared state and brain ----------------------------------------------
  function base(name, tune, svg) {
    svgRoot = svg;
    const c = {
      name, p: tune, alive: false, visible: true, g: make(svg, 'g'),
      B: { x: 0, y: 0 }, V: { x: 0, y: 0 }, home: { x: 0, y: 0 },
      heading: -Math.PI / 2, restHeading: -Math.PI / 2,
      wanderA: Math.random() * Math.PI * 2, paused: false, nextMood: 0,
      dest: null, spot: null, destUntil: 0, surge: 1,
      stalkUntil: 0, nextStalk: 0, clingUntil: 0, held: false,
      foe: null, aim: 0, fightUntil: 0, nextFight: 0,
      throwV: null, hurtUntil: 0, snapUntil: 0, dead: false, immune: false,
      fear: 0, mood: 'DORMANT', travel: 0, bulges: [], nextBite: 0, eaten: 0,
      carry: null, carryEl: null, carryTo: null, carryUntil: 0, giftWord: null,
      nextScrap: 0, fond: 0, fondOn: false, nextGift: 0,
      now: 0, hits: []
    };
    // Thrown by the mouse: carry on with the mouse's speed. A real throw
    // (not just letting go) makes it forget that it liked you.
    c.fling = (vx, vy) => {
      const v = Math.hypot(vx, vy), k = v > 40 ? 40 / v : 1;
      c.throwV = { x: vx * k, y: vy * k };
      c.clingUntil = 0;
      c.stalkUntil = 0;
      c.foe = null;
      const me = c.owner || c;
      if (v > 6) { me.fond = Math.max(0, me.fond - 0.6); me.fondOn = me.fond > 0.6; }
    };
    return c;
  }

  function eat(c, w) {
    words.swallow(w);
    c.lastText = w.text;
    eatFlesh(c);
    // Sometimes it keeps the word, to put it down somewhere else later.
    if (!c.carry && c.alive && Math.random() < CARRY_CHANCE) pickUp(c, w.text);
  }
  // Anything eaten (a word, a bite or a scrap of another creature) counts the same.
  function eatFlesh(c) {
    c.bulges.push(0);
    c.eaten++;
    c.snapUntil = c.now + 220;
    if (c.onEat) c.onEat();
  }

  // Carrying a word: it hangs from the mouth until the creature drops it into
  // a scar elsewhere, or brings it to you as a gift.
  function pickUp(c, text) {
    c.carry = text;
    if (!c.carryEl) c.carryEl = make(layer(), 'text', 'ero-carried');
    c.carryEl.textContent = text;
    c.carryEl.style.display = '';
    c.carryUntil = c.now + 18000;
    c.carryTo = null;
  }
  function dropCarry(c) {
    c.carry = null;
    c.carryTo = null;
    c.giftWord = null;
    if (c.carryEl) c.carryEl.style.display = 'none';
  }
  function putDown(c, x, y, gift) {
    dropWord(c.carry, x, y, gift);
    dropCarry(c);
  }

  // The part of a foe this creature is going for.
  function aimPoint(c) {
    const f = c.foe.form || c.foe;
    const parts = f.parts ? f.parts() : [];
    return parts.length ? parts[Math.floor(c.aim * parts.length) % parts.length] : c.foe.B;
  }

  // Where to next? Mix of sideways trips, nearby words, far-away words and,
  // now and then, a link to crawl into.
  function pickDest(c, now, env) {
    const h = env.view.bottom - env.view.top;
    const r = Math.random();
    c.dest = null;
    c.spot = null;
    if (r < LINK_CHANCE) {
      c.dest = words.randomLink(c.B.y - h * 1.5, c.B.y + h * 1.5);
    }
    if (c.dest) {
      // (a door: handled on arrival)
    } else if (r < 0.4) {
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

  // Fondness grows while you stay close (or hold it), and slowly fades.
  function updateFondness(c, me, now, env) {
    const near = env.dragged === me || (env.ptr.on && dist(env.ptr, c.B) < 240 * env.scale);
    if (near && !c.throwV) me.fond = Math.min(1, me.fond + STEP / FOND_MS);
    else me.fond = Math.max(0, me.fond - STEP / (FOND_MS * 5));
    if (!me.fondOn && me.fond > 0.6) { me.fondOn = true; me.nextGift = now + 4000; }
    if (me.fondOn && me.fond < 0.3) me.fondOn = false;
  }

  // What a carrying creature is heading for: you (a gift) or a scar.
  function carryGoal(c, me, now, env) {
    if (!c.carry) return null;
    if (now > c.carryUntil) {
      // Got bored of it: drop it where it is.
      const m = c.mouth ? c.mouth() : c.B;
      putDown(c, m.x, m.y + 5, false);
      return null;
    }
    if (me.fondOn && env.ptr.on) return env.ptr;
    if (!c.carryTo || !c.carryTo.gone || c.carryTo.filled) {
      const h = env.view.bottom - env.view.top;
      c.carryTo = words.scar(c.B.y - h, c.B.y + h);
    }
    return c.carryTo ? centre(c.carryTo) : null;
  }

  function steer(c, now, env) {
    const P = c.p, s = env.scale;
    c.held = false;

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
      if (c.carry) dropCarry(c);
      return;
    }

    const me = c.owner || c;
    const mouth = c.mouth ? c.mouth() : c.B;
    let stalking = false;
    let scrap = null, carryTo = null, gift = null;
    updateFondness(c, me, now, env);
    const fond = me.fondOn;

    if (env.dragged === me) {
      // Caught: it sits exactly where the pointer holds it.
      c.V.x = env.ptr.x + env.grab.x - c.B.x;
      c.V.y = env.ptr.y + env.grab.y - c.B.y;
      c.held = true;
      c.throwV = null;
      c.clingUntil = 0;
      c.foe = null;
      c.fear = fond ? 0 : 1;
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
      // It bit the cursor and hangs on to it, mouth first.
      c.V.x = env.ptr.x - mouth.x;
      c.V.y = env.ptr.y - mouth.y;
      c.held = true;
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

      // Now and then it gets bold and goes after the cursor (not if it likes you).
      if (!c.nextStalk) c.nextStalk = now + 8000 + Math.random() * 15000;
      if (env.ptr.on && now > c.nextStalk && !fond) {
        c.stalkUntil = now + 12000;
        c.nextStalk = now + 25000 + Math.random() * 25000;
      }
      if (fond) c.stalkUntil = 0;
      stalking = env.ptr.on && now < c.stalkUntil;

      // Fights: drop a fight that is over, or start one with a neighbour.
      const f = c.foe;
      if (f && (!f.alive || f.immune || now > c.fightUntil || dist(f.B, c.B) > 450 * s)) {
        c.foe = null;
        c.nextFight = now + (fond ? 800 : 3000);
      }
      // A fond creature guards you: anything that comes near your cursor gets attacked.
      if (fond && env.ptr.on && !c.foe && now > c.nextFight) {
        for (const o of env.creatures) {
          if (o === me || !o.alive || o.immune || o.fondOn) continue;
          if (dist(o.B, env.ptr) < 200 * s) {
            c.foe = o; c.aim = Math.random(); c.fightUntil = now + 5000; c.defending = true;
            break;
          }
        }
      }
      if (!c.foe && !stalking && now > c.nextFight) {
        c.nextFight = now + 1500;
        c.defending = false;
        for (const o of env.creatures) {
          if (o === me || !o.alive || o.immune) continue;
          if (dist(o.B, c.B) < P.fightRange * s && Math.random() < P.aggression) {
            c.foe = o;
            c.aim = Math.random(); // which part of it to go for
            c.fightUntil = now + 6000;
            break;
          }
        }
      }
      const fighting = !!c.foe && !stalking;

      c.wanderA += (Math.random() - 0.5) * P.turn;
      let dx = Math.cos(c.wanderA) * 0.6, dy = Math.sin(c.wanderA) * 0.6;

      // A fond creature now and then picks a word to bring you.
      if (fond && env.ptr.on && !c.carry && !c.giftWord && now > me.nextGift) {
        me.nextGift = now + 12000 + Math.random() * 10000;
        c.giftWord = words.ahead(mouth.x, mouth.y, c.heading, 260 * s, -1);
      }
      if (c.giftWord && (c.giftWord.gone || !fond)) c.giftWord = null;
      if (!stalking && !fighting) {
        carryTo = carryGoal(c, me, now, env);
        gift = !carryTo && c.giftWord ? centre(c.giftWord) : null;
        if (!carryTo && !gift && now > c.nextScrap) {
          scrap = ERO.debris.near(mouth, 280 * s, now); // something dead to eat?
        }
      }

      // Head for the cursor, a foe, something it is carrying or hunting, or its destination.
      const busy = stalking || fighting || carryTo || gift || scrap;
      if (!busy && (now > c.destUntil || (c.dest && c.dest.gone) || (!c.dest && !c.spot))) pickDest(c, now, env);
      if (c.spot && dist(c.spot, c.B) < 40 * s) pickDest(c, now, env);
      const lure = !busy && c.lure ? c.lure(now, env) : null;
      // A fond creature keeps close to you when it has nothing better to do.
      const stayClose = fond && env.ptr.on && !busy && !lure && dist(env.ptr, mouth) > 130 * s ? env.ptr : null;
      const goal = stalking ? env.ptr : fighting ? aimPoint(c) : carryTo || gift || scrap || stayClose || lure ||
        (c.dest ? centre(c.dest) : c.spot);
      let goalDist = Infinity;
      if (goal) {
        // Steer so the mouth (not the middle of the body) ends up on the goal.
        const gx = goal.x - mouth.x, gy = goal.y - mouth.y;
        goalDist = Math.hypot(gx, gy) || 1;
        const pull = stalking || fighting ? 3 : carryTo || gift || scrap || stayClose ? 2.2 : P.roam;
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

      // Shy: bolt away from the cursor (not while it is stalking it, and less
      // the fonder it is of you).
      c.fear = 0;
      if (env.ptr.on && !stalking && !fond) {
        const fx = c.B.x - env.ptr.x, fy = c.B.y - env.ptr.y;
        const d = Math.hypot(fx, fy) || 1;
        const radius = P.fleeRadius * s * (1 - me.fond);
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
      else if (carryTo || gift || scrap || stayClose) speed = P.cruise * 1.4 * s * c.surge;
      else if (c.paused && c.fear === 0 && !lure) speed = 0;
      const accel = c.fear > 0 || stalking || fighting ? 0.25 : 0.07;
      c.V.x += ((dx / len) * speed - c.V.x) * accel;
      c.V.y += ((dy / len) * speed - c.V.y) * accel;
      c.mood = stalking ? 'STALKING' : fighting ? (c.defending ? 'DEFENDING YOU' : 'FIGHTING')
        : c.fear > 0.25 ? 'SPOOKED' : carryTo ? (fond && env.ptr.on ? 'BRINGING A GIFT' : 'CARRYING')
        : gift ? 'FETCHING' : scrap ? 'SCAVENGING' : lure ? 'HUNTING' : fond ? 'FOND'
        : c.dest && c.dest.link ? 'TRAVELLING' : speed === 0 ? 'LURKING' : 'ROAMING';
    }

    // Move. Snakes and squids swing side to side as they travel (by
    // distance, not time, so the wave freezes when they stop).
    let mx = c.V.x, my = c.V.y;
    const v = Math.hypot(mx, my);
    if (P.wiggle && v > 0.05 && !c.throwV && !c.held) {
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

    // Close enough to the part it is aiming for: bite through it!
    if (c.foe && (c.mood === 'FIGHTING' || c.mood === 'DEFENDING YOU')) {
      const target = aimPoint(c);
      if (dist(mouth, target) < 26 * s) {
        const victim = c.foe.form || c.foe;
        if (victim.hurt) victim.hurt(now, { x: target.x, y: target.y });
        const kx = c.foe.B.x - c.B.x, ky = c.foe.B.y - c.B.y;
        const kd = Math.hypot(kx, ky) || 1;
        if (!victim.heavy) victim.throwV = { x: (kx / kd) * 8 * s, y: (ky / kd) * 8 * s }; // knocked away
        eatFlesh(c);
        c.foe = null;
        c.nextFight = now + 2500 + Math.random() * 2500;
      }
    }

    // Carrying: drop the word into the scar, or at your cursor as a gift.
    if (carryTo && dist(carryTo, mouth) < (carryTo === env.ptr ? 45 : 16) * s) {
      if (carryTo === env.ptr) {
        putDown(c, env.ptr.x + 10 * s, env.ptr.y - 12 * s, true);
      } else {
        const w = c.carryTo;
        w.filled = true;
        putDown(c, w.x, w.y + w.h * 0.78, false);
      }
    }
    // Fetching a gift: take the word in its mouth.
    if (gift && c.giftWord && dist(gift, mouth) < 16 * s) {
      const w = c.giftWord;
      c.giftWord = null;
      words.swallow(w);
      eatFlesh(c);
      pickUp(c, w.text);
    }
    // Scavenging: eat the piece of debris.
    if (scrap && dist(scrap, mouth) < 18 * s) {
      ERO.debris.eat(scrap.piece);
      eatFlesh(c);
      c.nextScrap = now + 450;
    }
    if (c.carry && c.carryEl) {
      c.carryEl.setAttribute('x', (mouth.x + 6 * s).toFixed(1));
      c.carryEl.setAttribute('y', (mouth.y + 4 * s).toFixed(1));
    }

    // Arrived at the destination: a link takes it to where the link points;
    // a word gets eaten.
    if (c.dest && !c.dest.gone && dist(centre(c.dest), mouth) < 16 * s) {
      const door = c.dest;
      c.dest = null;
      const to = door.link ? words.target(door.link) : null;
      if (to) {
        door.el.classList.add('ero-portal');
        setTimeout(() => door.el.classList.remove('ero-portal'), 900);
        c.teleport(to.x - mouth.x, to.y - mouth.y);
        c.destUntil = 0;
      } else if (!door.link) {
        eat(c, door);
      }
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

  // ---- Tentacles (squid and old one) ---------------------------------------
  // A tentacle is a chain of dots. Free, it trails and sways; when its tip
  // finds a letter it reaches for it and holds on, stretching between the
  // letter and the body. A bite can cut it at any joint.
  function makeTentacle(parent, k, count, withPincer) {
    const g = make(parent, 'g');
    const pts = Array.from({ length: count }, () => ({ x: 0, y: 0 }));
    return {
      k, pts, g, full: count, len: count, pincer: withPincer, grip: null, nextTry: 0, lost: false,
      lines: pts.slice(1).map(() => make(g, 'line', 'limb')),
      dots: pts.map(() => make(g, 'circle', 'dot')),
      claws: withPincer ? [make(g, 'polyline', 'ero-tendril ero-claw'), make(g, 'polyline', 'ero-tendril ero-claw')] : null
    };
  }

  function tentLetGo(ten) {
    if (ten.grip && ten.grip.held) words.release(ten.grip.word);
    ten.grip = null;
  }

  // cfg: seg, fanX/fanY (push per step), sway, reach, holdMs, reachMs,
  //      eats (does it eat what it holds?), canGrab
  function tentUpdate(c, ten, anchor, now, t, cfg) {
    const n = ten.len, pts = ten.pts, seg = cfg.seg;
    const total = (n - 1) * seg;
    const tip = pts[n - 1];
    pts[0].x = anchor.x; pts[0].y = anchor.y;

    if (ten.grip) {
      const gp = ten.grip;
      if (gp.t < 1) {
        // Reaching: the tip travels to the letter it wants.
        gp.t = Math.min(1, gp.t + STEP / cfg.reachMs);
        const e = smooth(gp.t);
        gp.x = gp.fx + (gp.tx - gp.fx) * e;
        gp.y = gp.fy + (gp.ty - gp.fy) * e;
        if (gp.t === 1 && !gp.word.gone) { words.grip(gp.word); gp.held = true; }
      }
      // Holding: tip on the letter, base on the body, chain stretched between.
      for (let it = 0; it < 2; it++) {
        tip.x = gp.x; tip.y = gp.y;
        followBack(pts, n, seg);
        pts[0].x = anchor.x; pts[0].y = anchor.y;
        follow(pts, n, seg);
      }
      const stretched = Math.hypot(gp.x - anchor.x, gp.y - anchor.y) > total * 0.92;
      if (stretched || now > gp.until || gp.word.gone || !c.alive || c.throwV || c.held) {
        const word = gp.word, held = gp.held;
        tentLetGo(ten);
        if (cfg.eats && held && !word.gone && c.alive) eat(c, word);
        ten.nextTry = now + 300 + Math.random() * 500;
      }
      return;
    }

    // Free: drift outward a little, trail behind, sway.
    for (let j = 1; j < n; j++) { pts[j].x += cfg.fanX; pts[j].y += cfg.fanY; }
    follow(pts, n, seg);
    if (!c.alive) return;
    for (let j = 1; j < n; j++) {
      const p = pts[j], q = pts[j - 1];
      const dx = p.x - q.x, dy = p.y - q.y;
      const d = Math.hypot(dx, dy) || 1;
      const sway = Math.sin(t * 3.2 + j * 0.45 + ten.k * 0.9) * cfg.sway;
      p.x += (-dy / d) * sway;
      p.y += (dx / d) * sway;
    }

    // Every so often the tip reaches for a letter close by.
    if (cfg.canGrab && now > ten.nextTry) {
      ten.nextTry = now + 250 + Math.random() * 600;
      const hit = words.foothold(tip.x, tip.y, cfg.reach, anchor, total * 0.8);
      if (hit) {
        ten.grip = {
          word: hit.word, held: false, t: 0,
          fx: tip.x, fy: tip.y, tx: hit.x, ty: hit.y, x: tip.x, y: tip.y,
          until: now + cfg.holdMs * (0.6 + Math.random() * 0.8)
        };
      }
    }
  }

  function tentDraw(ten, S, grow, clawLen, now) {
    ten.g.style.display = ten.lost ? 'none' : '';
    if (ten.lost) return;
    const n = ten.len, m = ten.full;
    for (let j = 0; j < m - 1; j++) {
      const on = j < n - 1;
      show(ten.lines[j], on);
      if (on) setLine(ten.lines[j], ten.pts[j].x, ten.pts[j].y, ten.pts[j + 1].x, ten.pts[j + 1].y);
    }
    for (let j = 0; j < m; j++) {
      const on = j < n;
      show(ten.dots[j], on);
      if (on) setDot(ten.dots[j], ten.pts[j].x, ten.pts[j].y, (2.4 - 1.5 * j / (m - 1)) * S * grow);
    }
    if (!ten.claws) return;
    // Pincer (only while the tentacle is whole): wide open while reaching,
    // shut when holding, slowly snapping while it waits.
    const whole = n === m;
    ten.claws.forEach((el) => show(el, whole));
    if (!whole) return;
    const tip = ten.pts[m - 1], pre = ten.pts[m - 2];
    const open = ten.grip ? (ten.grip.held ? 0.12 : 0.75) : 0.35 + 0.2 * Math.sin(now * 0.006 + ten.k);
    pincer(ten.claws, tip.x, tip.y, Math.atan2(tip.y - pre.y, tip.x - pre.x), open, clawLen);
  }

  // Cut a tentacle at joint j: everything past it falls off.
  function tentCut(ten, j, now, from) {
    j = clamp(j, 1, ten.len - 1);
    spawnDebris(ten.pts.slice(j, ten.len), from, now, 3);
    tentLetGo(ten);
    ten.len = j;
    if (ten.len < 4) {
      spawnDebris(ten.pts.slice(0, ten.len), from, now, 2);
      ten.lost = true;
    }
  }

  function tentRestore(ten) {
    tentLetGo(ten);
    ten.lost = false;
    ten.len = ten.full;
  }

  // The tentacle joint closest to p.
  function tentNearest(list, p) {
    let best = null;
    for (const ten of list) {
      if (ten.lost) continue;
      for (let j = 1; j < ten.len; j++) {
        const d = dist(p, ten.pts[j]);
        if (!best || d < best.d) best = { ten, j, d };
      }
    }
    return best;
  }

  // ---- Spiders (crawler, strider and their adult forms) --------------------
  function makeSpider(svg, o) {
    const c = base(o.name, o.tune, svg);
    const g = c.g;
    const size = o.size || 1;
    const n = o.body.length;
    const pos = o.body.map(() => ({ x: 0, y: 0 }));
    const prev = o.body.map(() => ({ x: 0, y: 0 }));
    // The first o.lines.length edges are the visible lines (they can be bitten
    // through); the rest are invisible braces.
    const edges = o.lines.concat(o.braces).map(([a, b]) => ({
      a, b, broken: false, len: Math.hypot(o.body[a][0] - o.body[b][0], o.body[a][1] - o.body[b][1]) * size
    }));
    const front = Math.max(...o.body.map((p) => p[0]));
    const back = Math.min(...o.body.map((p) => p[0]));
    const gut = o.body.map(([x]) => (front - x) / (front - back));
    const claws = new Set(o.claws || []);
    let S = 1;
    c.grips = 0;
    c.legScale = 1;
    c.heavy = !!o.heavy; // heavy forms are not knocked away by bites
    c.mouth = () => pos[0];
    const legClass = o.heavy ? 'limb ero-heavy' : o.glyphLegs ? 'limb ero-ghost' : 'limb';

    // Legs first so the body is drawn on top.
    const legs = [];
    o.slots.forEach(([hipL, hipR, deg], slot) => {
      [-1, 1].forEach((side) => {
        const lg = make(g, 'g', 'ero-leg');
        const leg = {
          slot, side, hip: side < 0 ? hipL : hipR, angle: deg * Math.PI / 180,
          group: (slot + (side < 0 ? 0 : 1)) % 2, // for the alternating spider gait
          active: false, dying: false, grow: 0, jp: null,
          foot: { x: 0, y: 0 }, from: { x: 0, y: 0 }, to: { x: 0, y: 0 },
          t: 1, dur: 200, word: null, gripped: false, g: lg, lines: [], dots: [],
          claw: claws.has(slot) ? [make(lg, 'polyline', 'ero-tendril ero-claw'), make(lg, 'polyline', 'ero-tendril ero-claw')] : null
        };
        for (let k = 0; k < o.segments; k++) leg.lines.push(make(lg, 'line', legClass));
        const dr = o.heavy ? 1.8 : 1;
        for (let k = 0; k < o.segments; k++) leg.dots.push(make(lg, 'circle', 'dot', { r: (k === o.segments - 1 ? 2.6 : 2) * dr }));
        // Legs written in characters (cathedral): brackets along the leg.
        leg.chars = o.glyphLegs ? Array.from({ length: o.legChars }, (_, k) => {
          const el = make(lg, 'text', 'ero-glyph');
          el.textContent = o.glyphLegs[(slot + k) % o.glyphLegs.length];
          return el;
        }) : null;
        legs.push(leg);
      });
    });
    const legAt = (slot, side) => legs[slot * 2 + (side < 0 ? 0 : 1)];
    const working = () => legs.filter((l) => l.active && !l.dying);

    // Optional tails: chains hanging off a body dot (stingers or silk threads).
    const tails = (o.tails || []).map((T) => {
      const pts = Array.from({ length: T.count }, () => ({ x: 0, y: 0 }));
      return {
        T, pts,
        lines: pts.slice(1).map(() => make(g, 'line', T.silk ? 'ero-silk' : 'limb ero-thick')),
        dots: T.silk ? [] : pts.map(() => make(g, 'circle', 'dot')),
        sting: T.stinger ? make(g, 'polyline', 'ero-tendril ero-claw') : null,
        claw: T.claw ? [make(g, 'polyline', 'ero-tendril ero-claw'), make(g, 'polyline', 'ero-tendril ero-claw')] : null
      };
    });

    // Silk web (weaver): threads spun between the letters it has gripped.
    const web = [];
    const webEls = o.web ? Array.from({ length: o.web * 2 }, () => make(g, 'line', 'ero-silk')) : [];

    const lineEls = o.lines.map(() => make(g, 'line', o.glyphBody ? 'limb ero-ghost' : 'limb'));
    const dotEls = o.body.map(() => make(g, 'circle', 'dot', { r: o.dotR }));
    // A body made of letters (throne): every body dot is a letter it has eaten.
    const pool = (o.glyphBody || '').split('');
    const bodyChars = o.glyphBody ? o.body.map((_, i) => {
      const el = make(g, 'text', 'ero-glyph ero-big');
      el.textContent = pool[i % pool.length];
      return el;
    }) : null;
    if (bodyChars) {
      c.onEat = () => {
        // Swap a random body letter for a letter of the last thing it ate.
        const w = c.lastText || '';
        if (!w) return;
        bodyChars[Math.floor(Math.random() * bodyChars.length)].textContent = w[Math.floor(Math.random() * w.length)];
      };
    }
    const jaws = o.mandibles ? [make(g, 'polyline', 'ero-tendril ero-claw'), make(g, 'polyline', 'ero-tendril ero-claw')] : null;
    c.hits = o.body.map(() => make(g, 'circle', 'hit', { r: 18 * size }));

    const reach = () => o.reach * S * c.legScale;
    const maxReach = () => reach() * (o.segments === 2 ? 2 * o.seg[0] : o.seg[0] + 2 * o.seg[1]);
    const wantScale = () => 1 + o.legGrowth * Math.max(0, working().length / 2 - o.startPairs);
    const brokenCount = () => edges.filter((e) => e.broken).length;

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
        if (!c.alive || c.throwV || c.held) {
          // Asleep, held or flying: the legs dangle back toward their rest spot.
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
            if (o.web && Math.random() < 0.35) {
              web.push({ x: leg.foot.x, y: leg.foot.y, t: c.now });
              if (web.length > o.web) web.shift();
            }
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

    function updateTails(t) {
      for (const tl of tails) {
        const { T, pts } = tl;
        const seg = T.seg * S;
        pts[0].x = pos[T.from].x; pts[0].y = pos[T.from].y;
        follow(pts, pts.length, seg);
        if (T.curl) {
          // A stinger tail curls round in an arc instead of just trailing.
          let a = c.heading + Math.PI;
          for (let j = 1; j < pts.length; j++) {
            a += T.curl;
            pts[j].x += (pts[j - 1].x + Math.cos(a) * seg - pts[j].x) * 0.2;
            pts[j].y += (pts[j - 1].y + Math.sin(a) * seg - pts[j].y) * 0.2;
          }
          follow(pts, pts.length, seg);
        }
        if (c.alive && T.silk) {
          for (let j = 1; j < pts.length; j++) pts[j].x += Math.sin(t * 2 + j * 0.6) * 0.3 * S;
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
      const bx = -Math.cos(c.heading), by = -Math.sin(c.heading);
      for (const { T, pts } of tails) {
        pts.forEach((p, j) => { p.x = pos[T.from].x + bx * T.seg * S * j; p.y = pos[T.from].y + by * T.seg * S * j; });
      }
    }

    c.step = (now, env) => {
      S = env.scale;
      c.now = now;
      steer(c, now, env);
      c.legScale += (wantScale() - c.legScale) * 0.03;

      // Body dots: own momentum, then chase their place on the moving body
      // (much tighter while held, so it follows the pointer without lag).
      const t = now / 1000;
      const spring = c.held ? 0.7 : o.spring;
      for (let i = 0; i < n; i++) {
        const vx = (pos[i].x - prev[i].x) * o.damping;
        const vy = (pos[i].y - prev[i].y) * o.damping;
        prev[i].x = pos[i].x;
        prev[i].y = pos[i].y;
        const p = bodyTarget(i);
        pos[i].x += vx + (p.x - pos[i].x) * spring;
        pos[i].y += vy + (p.y - pos[i].y) * spring;
        if (c.alive) {
          pos[i].x += Math.cos(t * 3.1 + i * 1.7) * o.breathe;
          pos[i].y += Math.sin(t * 2.7 + i * 1.3) * o.breathe;
        }
      }
      // Soft lines: only part of the length error is fixed each pass.
      // Bitten-through lines no longer hold anything together.
      for (let k = 0; k < o.iterations; k++) {
        for (const e of edges) {
          if (e.broken) continue;
          const p = pos[e.a], q = pos[e.b];
          const dx = q.x - p.x, dy = q.y - p.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const diff = (d - e.len * S) / d * o.stiff;
          p.x += dx * diff; p.y += dy * diff;
          q.x -= dx * diff; q.y -= dy * diff;
        }
      }

      updateLegs();
      updateTails(t);

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
          leg.jp = [{ x: hp.x, y: hp.y }, k, { x: fx, y: fy }];
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
          const k1 = { x: hp.x + (ux * Math.cos(a) + qx * Math.sin(a)) * L1, y: hp.y + (uy * Math.cos(a) + qy * Math.sin(a)) * L1 };
          const k2 = knee(k1.x, k1.y, fx, fy, R * o.seg[1], qx, qy, lift * 4 * S);
          setLine(leg.lines[0], hp.x, hp.y, k1.x, k1.y);
          setLine(leg.lines[1], k1.x, k1.y, k2.x, k2.y);
          setLine(leg.lines[2], k2.x, k2.y, fx, fy);
          setDot(leg.dots[0], k1.x, k1.y);
          setDot(leg.dots[1], k2.x, k2.y);
          setDot(leg.dots[2], fx, fy);
          leg.jp = [{ x: hp.x, y: hp.y }, k1, k2, { x: fx, y: fy }];
          last = k2;
        }
        if (leg.chars) {
          // Characters spaced evenly from hip to foot, turned along the leg.
          const jp = leg.jp;
          const segs = [];
          let total = 0;
          for (let i = 0; i < jp.length - 1; i++) { const l = dist(jp[i], jp[i + 1]); segs.push(l); total += l; }
          leg.chars.forEach((el, k) => {
            let d = (k + 0.5) / leg.chars.length * total, i = 0;
            while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
            const a = jp[i], b = jp[i + 1], f = segs[i] ? d / segs[i] : 0;
            const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
            const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
            el.setAttribute('x', x.toFixed(1));
            el.setAttribute('y', y.toFixed(1));
            el.setAttribute('font-size', ((13 - 5 * k / leg.chars.length) * S * size * 0.7 * Math.max(0.2, gr)).toFixed(1));
            el.setAttribute('transform', 'rotate(' + ang.toFixed(0) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
          });
        }
        if (leg.claw) {
          // Pincer arm: open while reaching, shut while holding a letter.
          const open = leg.t < 1 ? 0.75 : leg.gripped ? 0.12 : 0.4;
          pincer(leg.claw, fx, fy, Math.atan2(fy - last.y, fx - last.x), open, 13 * S * gr);
        }
      }

      for (const { pts, lines, dots, sting, claw } of tails) {
        lines.forEach((el, j) => setLine(el, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y));
        dots.forEach((el, j) => setDot(el, pts[j].x, pts[j].y, (j === pts.length - 1 ? 4 : 3 - 1.4 * j / pts.length) * S));
        if (claw) {
          // A tail that ends in a pincer, slowly snapping.
          const tp = pts[pts.length - 1], pr = pts[pts.length - 2];
          pincer(claw, tp.x, tp.y, Math.atan2(tp.y - pr.y, tp.x - pr.x), 0.3 + 0.25 * Math.sin(c.now * 0.007 + tp.x), 12 * S);
        }
        if (sting) {
          const tp = pts[pts.length - 1], pr = pts[pts.length - 2];
          const a = Math.atan2(tp.y - pr.y, tp.x - pr.x), L = 9 * S;
          const mx = tp.x + Math.cos(a) * L, my = tp.y + Math.sin(a) * L;
          setPoly(sting, [tp.x, tp.y, mx, my, mx + Math.cos(a + 2.3) * L * 0.7, my + Math.sin(a + 2.3) * L * 0.7]);
        }
      }

      o.lines.forEach(([a, b], i) => {
        show(lineEls[i], !edges[i].broken);
        setLine(lineEls[i], pos[a].x, pos[a].y, pos[b].x, pos[b].y);
      });
      for (let i = 0; i < n; i++) {
        setDot(dotEls[i], pos[i].x, pos[i].y, (bodyChars ? 1 : o.dotR) + bulgeAt(c, gut[i]) * 2.4 * size);
        setDot(c.hits[i], pos[i].x, pos[i].y);
        if (bodyChars) {
          const el = bodyChars[i];
          el.setAttribute('x', pos[i].x.toFixed(1));
          el.setAttribute('y', (pos[i].y + 5 * S).toFixed(1));
          el.setAttribute('font-size', ((15 + bulgeAt(c, gut[i]) * 8) * S * size * 0.6).toFixed(1));
        }
      }

      if (o.web) {
        // Threads from the abdomen to each anchor, and from anchor to anchor.
        const tip = pos[n - 1];
        webEls.forEach((el, k) => {
          const i = k >> 1, a = web[i];
          const on = !!a && c.alive && c.now - a.t < 12000;
          show(el, on);
          if (!on) return;
          const b = k % 2 ? web[i - 1] || tip : tip;
          setLine(el, a.x, a.y, b.x, b.y);
          el.setAttribute('opacity', (0.6 * (1 - (c.now - a.t) / 12000)).toFixed(2));
        });
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
      for (const { pts } of tails) for (const p of pts) { p.x += dx; p.y += dy; }
    };
    c.gatherAt = (x, y) => c.teleport(x - c.B.x, y - c.B.y);

    // A bite cuts whatever is closest to it: a whole leg, or one body line.
    c.hurt = (now, p) => {
      c.hurtUntil = now + 900;
      p = p || c.B;
      let best = null, bd = Infinity;
      for (const leg of working()) {
        const jp = leg.jp || [pos[leg.hip], leg.foot];
        for (let i = 0; i < jp.length - 1; i++) {
          const d = segDist(p, jp[i], jp[i + 1]);
          if (d < bd) { bd = d; best = { leg }; }
        }
      }
      o.lines.forEach(([a, b], i) => {
        if (edges[i].broken) return;
        const d = segDist(p, pos[a], pos[b]);
        if (d < bd) { bd = d; best = { line: i }; }
      });
      if (best && best.leg) {
        const leg = best.leg;
        spawnDebris(leg.jp || [pos[leg.hip], leg.foot], c.B, now, 3);
        letGo(leg);
        leg.active = false;
        leg.dying = false;
        leg.grow = 0;
      } else if (best) {
        const [a, b] = o.lines[best.line];
        edges[best.line].broken = true;
        spawnDebris([pos[a], pos[b]], c.B, now, 2);
      }
      if (working().length < 2 || brokenCount() >= o.breaks) c.dead = true;
    };

    c.parts = () => pos.concat(working().map((l) => (l.jp ? l.jp[1] : l.foot)));

    c.wake = () => { c.alive = true; c.nextMood = 0; c.nextStalk = 0; c.dest = c.spot = null; };
    c.sleep = () => { c.alive = false; c.stalkUntil = c.clingUntil = 0; c.foe = null; c.dest = c.spot = null; legs.forEach(letGo); };

    // Hatch out of a pupa: the legs unfold from nothing.
    c.emerge = (x, y, heading) => {
      c.B.x = x; c.B.y = y;
      c.V.x = c.V.y = 0;
      c.heading = c.wanderA = heading;
      Object.assign(c, { visible: true, alive: true, dead: false, dest: null, spot: null, nextStalk: 0, eaten: 0, grips: 0, bulges: [] });
      edges.forEach((e) => { e.broken = false; });
      web.length = 0;
      const keep = new Set(o.growOrder.slice(0, o.startPairs));
      legs.forEach((leg) => {
        letGo(leg);
        leg.active = keep.has(leg.slot);
        leg.dying = false;
        leg.grow = 0;
        leg.t = 1;
        leg.jp = null;
      });
      placeAtRest();
    };

    c.reset = () => {
      // Back to the starting legs: lost ones regrow, extra ones wither,
      // bitten lines heal.
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
      edges.forEach((e) => { e.broken = false; });
      web.length = 0;
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
    c.label = () => working().length + (o.claws ? ' LIMBS' : ' LEGS');

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

    // Coming back from a later form: start as a knot where it is.
    c.gatherAt = (x, y) => {
      for (const p of pts) { p.x = x; p.y = y; }
      c.B.x = x; c.B.y = y;
    };

    c.teleport = (dx, dy) => {
      c.B.x += dx; c.B.y += dy;
      for (const p of pts) { p.x += dx; p.y += dy; }
    };

    // Hatching out of a word: it starts as a knot and unspools as it moves.
    c.emerge = (x, y, heading) => {
      c.gatherAt(x, y);
      len = o.startLen;
      target = null;
      c.V.x = c.V.y = 0;
      c.heading = c.wanderA = heading;
      Object.assign(c, { visible: true, alive: true, dead: false, dest: null, spot: null, nextStalk: 0, eaten: 0, bulges: [] });
    };

    // A bite cuts the snake in two where it lands: everything behind the bite
    // falls away. Cut too close to the head and it dies.
    c.hurt = (now, p) => {
      c.hurtUntil = now + 900;
      p = p || pts[len - 1];
      let j = len - 1, bd = Infinity;
      for (let i = 2; i < len; i++) {
        const d = dist(p, pts[i]);
        if (d < bd) { bd = d; j = i; }
      }
      const piece = pts.slice(j, len);
      for (let i = 0; i < piece.length; i += 6) spawnDebris(piece.slice(i, i + 7), c.B, now, 3);
      len = j;
      if (len <= o.minLen) c.dead = true;
    };

    c.parts = () => pts.slice(1, len);

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
    c.label = () => len + ' SEGMENTS';
    return c;
  }

  // ---- Pupa ----------------------------------------------------------------
  // The creature curls into an egg wrapped in silk threads. It cannot move,
  // but it can be bitten: each bite tears the shell, and a torn-open pupa
  // dies. Each pupa is bigger than the one before.
  function makePupa(svg, o) {
    const c = base('PUPA', {}, svg);
    const g = c.g;
    let S = 1;
    let startAt = 0;
    let size = 1;
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
    c.heavy = true;
    const torn = new Set();

    // Begin: the creature's dots slide into an egg shape where it stands.
    c.begin = (body, x, y, heading, now, scale) => {
      for (let i = 0; i < K; i++) {
        const p = body[Math.round(i / (K - 1) * (body.length - 1))];
        from[i].x = pts[i].x = p.x;
        from[i].y = pts[i].y = p.y;
      }
      c.B.x = x; c.B.y = y;
      c.heading = heading;
      size = scale || 1;
      startAt = now;
      c.now = now;
      c.visible = true;
      c.alive = true;
      c.dead = false;
      torn.clear();
      c.mood = 'PUPATING';
    };

    // A bite tears the nearest piece of the shell off.
    c.hurt = (now, p) => {
      c.hurtUntil = now + 900;
      let best = -1, bd = Infinity;
      for (let i = 0; i < K; i++) {
        if (torn.has(i)) continue;
        const d = segDist(p || c.B, pts[i], pts[(i + 1) % K]);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) {
        torn.add(best);
        spawnDebris([pts[best], pts[(best + 1) % K]], c.B, now, 2);
      }
      if (torn.size >= o.tears) c.dead = true;
    };
    c.parts = () => pts;

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
        const lx = o.length * size * Math.cos(ang) * (1 + squash);
        const ly = o.width * size * Math.sin(ang) * (1 - 0.18 * Math.cos(ang)) * (1 - squash);
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
        show(outline[i], !torn.has(i));
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
    const broken = new Set(); // bitten-through mantle lines, like 'L3'
    let L = [], R = [];       // the mantle outline as last drawn
    c.mouth = () => spine[0];

    // Tentacles: long little snakes trailing from the back. Two are longer
    // still and end in a pincer.
    const tentacles = [];
    for (let k = 0; k < o.tentacles; k++) {
      const long = o.longOnes.includes(k);
      tentacles.push(makeTentacle(g, k, long ? o.longLen : o.armLen, long));
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

    // Lay the body out straight behind the head, facing `heading`.
    function straighten() {
      const bx = -Math.cos(c.heading), by = -Math.sin(c.heading);
      const seg = o.seg * S * grow;
      for (let i = 0; i < N; i++) { spine[i].x = c.B.x + bx * seg * i; spine[i].y = c.B.y + by * seg * i; }
      computeNormals();
      const an = anchors();
      const tseg = o.tseg * S * grow;
      tentacles.forEach((t, k) => {
        tentLetGo(t);
        t.pts.forEach((p, j) => {
          p.x = an[k].x + bx * tseg * j;
          p.y = an[k].y + by * tseg * j;
        });
      });
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
      const nrm = norms[N - 1];
      tentacles.forEach((ten, k) => {
        if (ten.lost) return;
        const f = (k / (o.tentacles - 1) - 0.5) * 2 * o.fan * S;
        tentUpdate(c, ten, an[k], now, t, {
          seg: o.tseg * S * grow, fanX: nrm.x * f, fanY: nrm.y * f, sway: 0.7 * S,
          reach: (ten.pincer ? o.longReach : o.armReach) * S,
          holdMs: ten.pincer ? o.longHoldMs : o.armHoldMs, reachMs: o.reachMs,
          eats: ten.pincer, canGrab: grow === 1 && !c.throwV && !c.held
        });
      });

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
      L = []; R = [];
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const w = (width(u) * (1 - 0.15 * pulse) * grow + bulgeAt(c, u) * 4) * S;
        L.push({ x: spine[i].x + norms[i].x * w, y: spine[i].y + norms[i].y * w });
        R.push({ x: spine[i].x - norms[i].x * w, y: spine[i].y - norms[i].y * w });
      }

      tentacles.forEach((ten) => tentDraw(ten, S, grow, o.claw * S * grow, c.now));

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
        show(leftEls[i], !broken.has('L' + i));
        show(rightEls[i], !broken.has('R' + i));
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
      broken.clear();
      tentacles.forEach(tentRestore);
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
        tentLetGo(t);
        for (const p of t.pts) { p.x += dx; p.y += dy; }
      }
    };

    // A bite cuts a tentacle at the joint it lands on, or bites through a
    // line of the mantle. Too broken and it dies.
    c.hurt = (now, p) => {
      c.hurtUntil = now + 900;
      p = p || c.B;
      const tn = tentNearest(tentacles, p);
      let side = null, bd = Infinity;
      for (let i = 1; i < Math.min(L.length, N) - 1; i++) {
        for (const [key, arr] of [['L' + i, L], ['R' + i, R]]) {
          if (broken.has(key)) continue;
          const d = segDist(p, arr[i], arr[i + 1]);
          if (d < bd) { bd = d; side = { key, a: arr[i], b: arr[i + 1] }; }
        }
      }
      if (tn && tn.d <= bd) tentCut(tn.ten, tn.j, now, c.B);
      else if (side) { broken.add(side.key); spawnDebris([side.a, side.b], c.B, now, 2); }
      if (broken.size >= 4 || tentacles.filter((t) => !t.lost).length < 3) c.dead = true;
    };

    c.parts = () => spine.concat(tentacles.filter((t) => !t.lost).map((t) => t.pts[Math.floor(t.len / 2)]));

    c.wake = () => { c.alive = true; c.nextMood = 0; c.nextStalk = 0; c.dest = c.spot = null; };
    c.sleep = () => {
      c.alive = false;
      c.stalkUntil = c.clingUntil = 0;
      c.foe = null;
      c.dest = c.spot = null;
      tentacles.forEach(tentLetGo);
    };
    c.reset = () => {
      tentacles.forEach(tentRestore);
      broken.clear();
      Object.assign(c, { eaten: 0, bulges: [], dead: false, throwV: null, clingUntil: 0 });
    };

    c.settled = () => !c.bulges.length && grow === 1 && c.now >= c.hurtUntil &&
      Math.hypot(c.B.x - c.home.x, c.B.y - c.home.y) < 0.3 && Math.hypot(c.V.x, c.V.y) < 0.05;

    c.body = () => spine.concat(tentacles.filter((t) => !t.lost).map((t) => t.pts[t.len - 1]));
    c.label = () => tentacles.filter((t) => !t.lost).length + ' TENTACLES';
    return c;
  }

  // ---- Old one -------------------------------------------------------------
  // The snake's last form: a soft, heaving head that bulges out behind,
  // a cluster of blinking eyes, a beard of short feeding tentacles at the
  // front, long grasping tentacles round the back and two slow bat wings.
  function makeElder(svg, o) {
    const c = base(o.name, o.tune, svg);
    const g = c.g;
    let S = 1;
    let grow = 1;
    const RN = o.ring;
    const ring = Array.from({ length: RN }, () => ({ x: 0, y: 0 }));
    const brokenRing = new Set();
    const brokenBones = new Set(); // like 'L2'
    let bones = [];                // wing bones as last drawn
    c.mouth = () => c.B;

    // Leviathan only: a long chain from the back of the body to a second,
    // smaller body with its own tentacles. A bite on the chain cuts the
    // second body loose.
    const TB = o.tailBody;
    const chain = TB ? Array.from({ length: TB.links }, () => ({ x: 0, y: 0 })) : [];
    let chainLen = chain.length, second = !!TB, heading2 = 0;
    const chainEls = chain.slice(1).map(() => make(g, 'line', 'limb ero-thick'));
    const chainDots = chain.map(() => make(g, 'circle', 'dot'));
    const ring2 = TB ? Array.from({ length: TB.ring }, () => ({ x: 0, y: 0 })) : [];
    const ring2Els = ring2.map(() => make(g, 'line', 'limb ero-thick'));
    const ring2Dots = ring2.map(() => make(g, 'circle', 'dot'));
    const tents2 = TB ? Array.from({ length: TB.arms }, (_, k) => {
      const ten = makeTentacle(g, 50 + k, TB.armLen, false);
      ten.at = Math.PI + (k / (TB.arms - 1) - 0.5) * 2 * 1.3;
      return ten;
    }) : [];

    function placeSecond(t, snap) {
      if (!TB) return;
      const n = chainLen;
      const end = chain[n - 1], pre = chain[Math.max(0, n - 2)];
      heading2 = Math.atan2(pre.y - end.y, pre.x - end.x);
      const r2 = TB.radius * S * grow;
      const cx = end.x - Math.cos(heading2) * r2, cy = end.y - Math.sin(heading2) * r2;
      ring2.forEach((p, i) => {
        const th = (i / ring2.length) * Math.PI * 2;
        const heave = c.alive ? 1 + 0.08 * Math.sin(3 * th - t * 1.7) : 1;
        const x = cx + Math.cos(heading2 + th) * r2 * heave, y = cy + Math.sin(heading2 + th) * r2 * heave;
        if (snap) { p.x = x; p.y = y; } else { p.x += (x - p.x) * 0.3; p.y += (y - p.y) * 0.3; }
      });
      return { x: cx, y: cy, r: r2 };
    }

    // Wings first (behind everything).
    const wings = [-1, 1].map((side) => ({
      side,
      bones: [0, 1, 2, 3].map(() => make(g, 'polyline', 'limb')),
      webs: [0, 1, 2].map(() => make(g, 'polyline', 'ero-tendril')),
      tips: [0, 1, 2, 3].map(() => make(g, 'circle', 'dot'))
    }));

    // Tentacles: the long ones spread round the back half, the short beard
    // in front. `at` is the angle on the body where each one is attached.
    const tentacles = [];
    for (let k = 0; k < o.arms; k++) {
      const ten = makeTentacle(g, k, o.armLen, k % 4 === 1);
      ten.at = Math.PI + (k / (o.arms - 1) - 0.5) * 2 * 1.45;
      ten.face = false;
      tentacles.push(ten);
    }
    for (let k = 0; k < o.face; k++) {
      const ten = makeTentacle(g, o.arms + k, o.faceLen, false);
      ten.at = (k / (o.face - 1) - 0.5) * 2 * 0.75;
      ten.face = true;
      tentacles.push(ten);
    }

    const ringEls = ring.map(() => make(g, 'line', 'limb ero-thick'));
    const ringDots = ring.map(() => make(g, 'circle', 'dot'));
    const EYES = [[0, 0], [-6, -8], [-6, 8], [4, -13], [4, 13], [-14, 0], [9, 0]];
    const eyes = EYES.map(() => ({ el: make(g, 'circle', 'dot'), blinkUntil: 0 }));
    c.hits = ring.map(() => make(g, 'circle', 'hit', { r: 20 }));
    if (TB) chain.forEach(() => c.hits.push(make(g, 'circle', 'hit', { r: 16 })));
    c.visible = false;

    const dir = (a) => ({ x: Math.cos(a), y: Math.sin(a) });
    // Body centre sits behind the face (B).
    const centreOf = () => {
      const f = dir(c.heading), r = o.radius * S * grow;
      return { x: c.B.x - f.x * r * 0.8, y: c.B.y - f.y * r * 0.8 };
    };
    // The body outline: bulging out behind, gently heaving.
    function radiusAt(th, t) {
      const back = 1 + 0.45 * Math.max(0, -Math.cos(th));
      const heave = c.alive ? 1 + 0.08 * Math.sin(3 * th + t * 1.4) + 0.06 * Math.sin(5 * th - t) : 1;
      return o.radius * S * grow * back * heave;
    }
    function pointAt(cen, th, t) {
      const r = radiusAt(th, t), d = dir(c.heading + th);
      return { x: cen.x + d.x * r, y: cen.y + d.y * r };
    }

    function layOut(t) {
      const cen = centreOf();
      ring.forEach((p, i) => { const q = pointAt(cen, (i / RN) * Math.PI * 2, t); p.x = q.x; p.y = q.y; });
      if (TB) {
        const back = pointAt(cen, Math.PI, t), d = dir(c.heading + Math.PI);
        chain.forEach((p, j) => { p.x = back.x + d.x * TB.seg * S * grow * j; p.y = back.y + d.y * TB.seg * S * grow * j; });
        placeSecond(t, true);
        tents2.forEach((ten) => { tentLetGo(ten); ten.pts.forEach((p) => { p.x = chain[chain.length - 1].x; p.y = chain[chain.length - 1].y; }); });
      }
      tentacles.forEach((ten) => {
        tentLetGo(ten);
        const a = pointAt(cen, ten.at, t), d = dir(c.heading + ten.at);
        const seg = (ten.face ? o.faceSeg : o.tseg) * S * grow;
        ten.pts.forEach((p, j) => { p.x = a.x + d.x * seg * j; p.y = a.y + d.y * seg * j; });
      });
    }

    c.step = (now, env) => {
      S = env.scale;
      c.now = now;
      if (grow < 1) grow = Math.min(1, grow + 0.012);
      steer(c, now, env);

      const t = now / 1000;
      const cen = centreOf();
      // The outline chases its shape softly, so the body sloshes as it moves.
      const k = c.held || !c.alive ? 1 : 0.3;
      ring.forEach((p, i) => {
        const q = pointAt(cen, (i / RN) * Math.PI * 2, t);
        p.x += (q.x - p.x) * k;
        p.y += (q.y - p.y) * k;
      });

      tentacles.forEach((ten) => {
        if (ten.lost) return;
        const a = pointAt(cen, ten.at, t), d = dir(c.heading + ten.at);
        const fan = (ten.face ? o.faceFan : o.fan) * S;
        tentUpdate(c, ten, a, now, t, {
          seg: (ten.face ? o.faceSeg : o.tseg) * S * grow,
          fanX: d.x * fan, fanY: d.y * fan, sway: (ten.face ? 1.1 : 0.8) * S,
          reach: (ten.face ? o.faceReach : o.armReach) * S,
          holdMs: ten.face ? o.faceHoldMs : o.armHoldMs, reachMs: o.reachMs,
          eats: ten.face || ten.pincer, canGrab: grow === 1 && !c.throwV && !c.held
        });
      });

      if (TB) {
        chain[0] = Object.assign(chain[0], pointAt(cen, Math.PI, t));
        follow(chain, chainLen, TB.seg * S * grow);
        if (second) {
          const c2 = placeSecond(t, c.held || !c.alive);
          tents2.forEach((ten) => {
            if (ten.lost) return;
            const a = heading2 + ten.at;
            const an = { x: c2.x + Math.cos(a) * c2.r, y: c2.y + Math.sin(a) * c2.r };
            tentUpdate(c, ten, an, now, t, {
              seg: o.tseg * S * grow, fanX: Math.cos(a) * 0.5 * S, fanY: Math.sin(a) * 0.5 * S, sway: 0.8 * S,
              reach: o.armReach * S, holdMs: o.armHoldMs, reachMs: o.reachMs,
              eats: false, canGrab: grow === 1 && !c.throwV && !c.held
            });
          });
        }
      }

      // It also gulps whatever word its face passes over.
      if (c.alive && now > c.nextBite) {
        const w = words.under(c.B.x, c.B.y, 6 * S);
        if (w) { eat(c, w); c.nextBite = now + o.mouthGap; }
      }
      // Eyes blink at random.
      if (c.alive) eyes.forEach((e) => { if (Math.random() < 0.004) e.blinkUntil = now + 140; });
      advanceBulges(c, 0.02);
    };

    c.draw = () => {
      if (!paint(c)) return;
      const t = c.now / 1000;
      const cen = centreOf();
      const f = dir(c.heading);

      // Wings: four long finger bones each, webbed between with scalloped edges.
      bones = [];
      const flap = c.alive ? Math.sin(t * 2.4) * 0.35 : 0;
      for (const w of wings) {
        const sh = pointAt(cen, w.side * 1.75, t);
        const tips = [];
        w.bones.forEach((el, k) => {
          const key = (w.side < 0 ? 'L' : 'R') + k;
          const a = c.heading + w.side * (1.75 + 0.35 * k + flap * (1 - k * 0.15));
          const L = o.wing * S * grow * [1, 0.92, 0.8, 0.65][k];
          const tip = { x: sh.x + Math.cos(a) * L, y: sh.y + Math.sin(a) * L };
          const mid = { x: sh.x + Math.cos(a - w.side * 0.25) * L * 0.5, y: sh.y + Math.sin(a - w.side * 0.25) * L * 0.5 };
          const ok = !brokenBones.has(key);
          show(el, ok);
          show(w.tips[k], ok);
          setPoly(el, [sh.x, sh.y, mid.x, mid.y, tip.x, tip.y]);
          setDot(w.tips[k], tip.x, tip.y, 2.2 * S);
          tips.push(ok ? tip : null);
          if (ok) bones.push({ key, pts: [sh, mid, tip] });
        });
        w.webs.forEach((el, k) => {
          const a = tips[k], b = tips[k + 1];
          show(el, !!(a && b));
          if (!a || !b) return;
          const mx = (a.x + b.x) / 2 + (sh.x - (a.x + b.x) / 2) * 0.3;
          const my = (a.y + b.y) / 2 + (sh.y - (a.y + b.y) / 2) * 0.3;
          setPoly(el, [a.x, a.y, mx, my, b.x, b.y]);
        });
      }

      tentacles.forEach((ten) => tentDraw(ten, S, grow, o.claw * S * grow, c.now));

      if (TB) {
        for (let j = 0; j < chain.length - 1; j++) {
          const on = j < chainLen - 1;
          show(chainEls[j], on);
          if (on) setLine(chainEls[j], chain[j].x, chain[j].y, chain[j + 1].x, chain[j + 1].y);
        }
        chain.forEach((p, j) => {
          const on = j < chainLen;
          show(chainDots[j], on);
          show(c.hits[RN + j], on);
          setDot(chainDots[j], p.x, p.y, (3.4 - 1.4 * j / chain.length) * S * grow);
          setDot(c.hits[RN + j], p.x, p.y);
        });
        ring2.forEach((p, i) => {
          show(ring2Els[i], second);
          show(ring2Dots[i], second);
          const q = ring2[(i + 1) % ring2.length];
          setLine(ring2Els[i], p.x, p.y, q.x, q.y);
          setDot(ring2Dots[i], p.x, p.y, 2.2 * S);
        });
        tents2.forEach((ten) => { ten.lost = ten.lost || !second; tentDraw(ten, S, grow, o.claw * S * grow, c.now); });
      }

      for (let i = 0; i < RN; i++) {
        const q = ring[(i + 1) % RN];
        show(ringEls[i], !brokenRing.has(i));
        setLine(ringEls[i], ring[i].x, ring[i].y, q.x, q.y);
        const th = (i / RN) * Math.PI * 2;
        setDot(ringDots[i], ring[i].x, ring[i].y, (2.4 + bulgeAt(c, (1 - Math.cos(th)) / 2) * 3) * S);
        setDot(c.hits[i], ring[i].x, ring[i].y);
      }

      // Eyes: a cluster on the front of the head.
      const ex = cen.x + f.x * o.radius * S * grow * 0.35, ey = cen.y + f.y * o.radius * S * grow * 0.35;
      const cs = Math.cos(c.heading), sn = Math.sin(c.heading);
      eyes.forEach((e, i) => {
        const [lx, ly] = EYES[i];
        const r = c.now < e.blinkUntil ? 0.4 : 2.6;
        setDot(e.el, ex + (lx * cs - ly * sn) * S * grow, ey + (lx * sn + ly * cs) * S * grow, r * S * grow);
      });
    };

    c.emerge = (x, y, heading) => {
      c.B.x = x; c.B.y = y;
      c.V.x = c.V.y = 0;
      c.heading = c.wanderA = heading;
      grow = 0.2;
      Object.assign(c, { visible: true, alive: true, dead: false, dest: null, spot: null, nextStalk: 0, eaten: 0, bulges: [] });
      brokenRing.clear();
      brokenBones.clear();
      tentacles.forEach(tentRestore);
      tents2.forEach(tentRestore);
      chainLen = chain.length;
      second = !!TB;
      layOut(0);
    };

    c.setHome = (x, y, scale) => {
      c.home.x = x; c.home.y = y;
      S = scale;
      if (!c.alive && c.visible) {
        c.B.x = x; c.B.y = y;
        c.heading = c.restHeading;
        layOut(0);
      }
    };

    c.teleport = (dx, dy) => {
      c.B.x += dx; c.B.y += dy;
      for (const p of ring.concat(chain, ring2)) { p.x += dx; p.y += dy; }
      for (const t of tentacles.concat(tents2)) {
        tentLetGo(t);
        for (const p of t.pts) { p.x += dx; p.y += dy; }
      }
    };

    // A bite cuts a tentacle, snaps a wing bone or tears the body outline.
    c.hurt = (now, p) => {
      c.hurtUntil = now + 900;
      p = p || c.B;
      const tn = tentNearest(tentacles, p);
      let best = tn ? { d: tn.d, cut: () => tentCut(tn.ten, tn.j, now, c.B) } : null;
      for (const b of bones) {
        const d = Math.min(segDist(p, b.pts[0], b.pts[1]), segDist(p, b.pts[1], b.pts[2]));
        if (!best || d < best.d) best = { d, cut: () => { brokenBones.add(b.key); spawnDebris(b.pts, c.B, now, 3); } };
      }
      for (let i = 0; i < RN; i++) {
        if (brokenRing.has(i)) continue;
        const a = ring[i], q = ring[(i + 1) % RN];
        const d = segDist(p, a, q);
        if (!best || d < best.d) best = { d, cut: () => { brokenRing.add(i); spawnDebris([a, q], c.B, now, 2); } };
      }
      // Leviathan: cut the chain, and everything behind the cut falls away.
      for (let j = 2; j < chainLen; j++) {
        const d = dist(p, chain[j]);
        if (!best || d < best.d) {
          best = { d, cut: () => {
            spawnDebris(chain.slice(j, chainLen), c.B, now, 3);
            if (second) {
              spawnDebris(ring2.concat(ring2[0]), c.B, now, 2, CORPSE_MS);
              tents2.forEach((ten) => { if (!ten.lost) spawnDebris(ten.pts.slice(0, ten.len), c.B, now, 2); tentLetGo(ten); ten.lost = true; });
            }
            chainLen = j;
            second = false;
          } };
        }
      }
      if (best) best.cut();
      if (brokenRing.size >= 5 || tentacles.filter((t) => !t.lost).length < 4) c.dead = true;
    };

    c.parts = () => ring.concat(chain.slice(2, chainLen), second ? ring2 : [],
      tentacles.filter((t) => !t.lost).map((t) => t.pts[Math.floor(t.len / 2)]));

    c.wake = () => { c.alive = true; c.nextMood = 0; c.nextStalk = 0; c.dest = c.spot = null; };
    c.sleep = () => {
      c.alive = false;
      c.stalkUntil = c.clingUntil = 0;
      c.foe = null;
      c.dest = c.spot = null;
      tentacles.concat(tents2).forEach(tentLetGo);
    };
    c.reset = () => {
      tentacles.forEach(tentRestore);
      tents2.forEach(tentRestore);
      chainLen = chain.length;
      second = !!TB;
      brokenRing.clear();
      brokenBones.clear();
      Object.assign(c, { eaten: 0, bulges: [], dead: false, throwV: null, clingUntil: 0 });
    };

    c.settled = () => !c.bulges.length && grow === 1 && c.now >= c.hurtUntil &&
      Math.hypot(c.B.x - c.home.x, c.B.y - c.home.y) < 0.3 && Math.hypot(c.V.x, c.V.y) < 0.05;

    c.body = () => ring.slice();
    c.label = () => tentacles.filter((t) => !t.lost).length + ' TENTACLES';
    return c;
  }

  // ---- Glyph creatures (the mutants, and the abyss) -------------------------
  // Bodies written in type, after the crawl_33, crawl_38 and crawl_39 designs:
  //   RIBS:  a spine of bracket vertebrae with a curling rib on each side
  //   BRACE: arms written in bracket characters, growing from one point
  //   QUILL: a slim spine with paired barbs and a curled tail
  // o.bones says how many vertebrae (or arms), o.size how big it is.
  const BRACKETS = [['(', ')'], ['{', '}'], ['[', ']'], ['<', '>']];
  const BRACE_TEXT = '()(){}()[]';

  // A limb that starts at (x, y) facing angle a and turns by cf(u) along its
  // length (u goes 0 to 1). Returns flat [x, y, x, y, ...] points.
  function tendrilPts(x, y, a, len, cf, steps) {
    const P = [x, y];
    let g = a;
    for (let i = 1; i <= steps; i++) {
      g += cf(i / steps) / steps;
      x += Math.cos(g) * len / steps;
      y += Math.sin(g) * len / steps;
      P.push(x, y);
    }
    return P;
  }

  function glyphAt(el, x, y, size, rad) {
    el.setAttribute('x', x.toFixed(1));
    el.setAttribute('y', y.toFixed(1));
    el.setAttribute('font-size', Math.max(0.1, size).toFixed(1));
    el.setAttribute('transform', 'rotate(' + (rad * 180 / Math.PI).toFixed(0) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
  }

  function makeGlyph(svg, o) {
    const c = base(o.name, o.tune, svg);
    const g = c.g;
    const z = o.size;
    const brace = o.kind === 'brace';
    let S = 1, grow = 1, agit = 0, env = null;
    let count = o.bones;                      // vertebrae left (ribs, quill)
    const spine = Array.from({ length: brace ? 1 : o.bones }, () => ({ x: 0, y: 0 }));
    c.mouth = () => spine[0];

    // ---- the parts, back to front ----
    const bones = brace ? [] : spine.map((_, i) => ({
      ribs: [0, 1, 2, 3].slice(0, o.kind === 'quill' ? 4 : 2).map(() => make(g, 'polyline', o.kind === 'quill' ? 'ero-tendril' : 'limb')),
      tips: [0, 1, 2, 3].slice(0, o.kind === 'quill' ? 4 : 2).map(() => make(g, 'circle', 'dot')),
      brackets: [0, 1].map((k) => {
        const el = make(g, 'text', 'ero-glyph');
        el.textContent = BRACKETS[i % 4][k];
        return el;
      }),
      core: make(g, 'circle', 'dot'),
      blinkUntil: 0
    }));
    const spineLine = o.kind === 'quill' ? make(g, 'polyline', 'limb') : null;
    const tail = o.kind === 'quill' ? make(g, 'polyline', 'limb') : null;
    const arms = brace ? Array.from({ length: o.bones }, (_, k) => {
      const pts = Array.from({ length: o.armLen }, () => ({ x: 0, y: 0 }));
      return {
        k, pts, len: o.armLen, lost: false,
        chars: pts.slice(1).map((_, j) => {
          const el = make(g, 'text', 'ero-glyph');
          el.textContent = BRACE_TEXT[(k % 4 + j) % BRACE_TEXT.length];
          return el;
        }),
        tip: make(g, 'circle', 'dot')
      };
    }) : [];
    const hub = brace ? make(g, 'circle', 'dot') : null;
    c.hits = (brace ? [spine[0]] : spine).map(() => make(g, 'circle', 'hit', { r: 15 * z }));
    c.visible = false;

    const segLen = () => o.seg * z * S * grow;
    // Direction from bone i toward the tail.
    const tailAng = (i) => {
      const a = spine[Math.min(i, count - 2)], b = spine[Math.min(i, count - 2) + 1];
      return a && b ? Math.atan2(b.y - a.y, b.x - a.x) : c.heading + Math.PI;
    };
    // Limbs lean toward the cursor when it is close (from the live demo).
    function lean(a, x, y) {
      if (!env || !env.ptr.on) return a;
      const dx = env.ptr.x - x, dy = env.ptr.y - y;
      return a + wrap(Math.atan2(dy, dx) - a) * Math.exp(-Math.hypot(dx, dy) / 110) * 0.5;
    }

    function straighten() {
      const bx = -Math.cos(c.heading), by = -Math.sin(c.heading);
      spine.forEach((p, i) => { p.x = c.B.x + bx * segLen() * i; p.y = c.B.y + by * segLen() * i; });
      arms.forEach((arm) => arm.pts.forEach((p, j) => { p.x = c.B.x + bx * o.tseg * z * S * grow * j; p.y = c.B.y + by * o.tseg * z * S * grow * j; }));
    }

    c.step = (now, e) => {
      env = e;
      S = e.scale;
      c.now = now;
      if (grow < 1) grow = Math.min(1, grow + 0.012);
      agit = Math.max(c.held || now < c.hurtUntil ? 1 : 0, agit - 0.012);
      steer(c, now, e);
      spine[0].x = c.B.x; spine[0].y = c.B.y;
      if (!brace) follow(spine, count, segLen());

      const t = now / 1000;
      arms.forEach((arm) => {
        if (arm.lost) return;
        // Arms trail behind the hub, fanned out, rippling.
        const at = c.heading + Math.PI + (arm.k / (o.bones - 1) - 0.5) * 2 * 1.25 * (1 + 0.45 * agit);
        const seg = o.tseg * z * S * grow;
        arm.pts[0].x = c.B.x; arm.pts[0].y = c.B.y;
        for (let j = 1; j < arm.len; j++) {
          arm.pts[j].x += Math.cos(at) * 0.7 * S;
          arm.pts[j].y += Math.sin(at) * 0.7 * S;
        }
        follow(arm.pts, arm.len, seg);
        if (!c.alive) return;
        for (let j = 1; j < arm.len; j++) {
          const p = arm.pts[j], q = arm.pts[j - 1];
          const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
          const sway = Math.sin(t * 2.2 + j * 0.5 + arm.k) * (0.5 + 0.4 * agit) * S;
          p.x += (-dy / d) * sway;
          p.y += (dx / d) * sway;
        }
      });

      // It eats whatever word its front end passes over.
      if (c.alive && now > c.nextBite) {
        const w = words.under(c.B.x, c.B.y, 5 * S * z);
        if (w) { eat(c, w); c.nextBite = now + o.biteGap; }
      }
      if (c.alive && o.eyes) bones.forEach((b) => { if (Math.random() < 0.004) b.blinkUntil = now + 150; });
      advanceBulges(c, 0.02);
    };

    c.draw = () => {
      if (!paint(c)) return;
      const t = c.now / 1000, k = grow * S * z;
      if (brace) {
        setDot(hub, c.B.x, c.B.y, 3 * k + bulgeAt(c, 0.2) * 3);
        setDot(c.hits[0], c.B.x, c.B.y);
        arms.forEach((arm) => {
          arm.chars.forEach((el, j) => {
            const on = !arm.lost && j + 1 < arm.len;
            show(el, on);
            if (!on) return;
            const a = arm.pts[j], b = arm.pts[j + 1];
            const u = j / (arm.chars.length - 1 || 1);
            glyphAt(el, b.x, b.y, (19 - 10 * u) * 0.7 * k, Math.atan2(b.y - a.y, b.x - a.x));
          });
          show(arm.tip, !arm.lost);
          if (!arm.lost) setDot(arm.tip, arm.pts[arm.len - 1].x, arm.pts[arm.len - 1].y, 1.8 * S);
        });
        return;
      }

      bones.forEach((b, i) => {
        const on = i < count;
        b.ribs.concat(b.tips, b.brackets, [b.core]).forEach((el) => show(el, on));
        show(c.hits[i], on);
        if (!on) return;
        const p = spine[i], ta = tailAng(i);
        setDot(c.hits[i], p.x, p.y);
        const u = count > 1 ? i / (count - 1) : 0;
        const fat = 1 + bulgeAt(c, u) * 0.6;
        if (o.kind === 'ribs') {
          // A pair of brackets round a dot, and a rib curling back on each side.
          const half = 11 * k * fat;
          glyphAt(b.brackets[0], p.x + Math.cos(ta + Math.PI / 2) * half, p.y + Math.sin(ta + Math.PI / 2) * half, (21 - i * 0.5) * k * 0.8, ta - Math.PI / 2);
          glyphAt(b.brackets[1], p.x + Math.cos(ta - Math.PI / 2) * half, p.y + Math.sin(ta - Math.PI / 2) * half, (21 - i * 0.5) * k * 0.8, ta - Math.PI / 2);
          const eye = o.eyes && c.now < b.blinkUntil;
          setDot(b.core, p.x, p.y, (o.eyes ? (eye ? 0.4 : 2.8) : 1.8) * k);
          const wave = c.alive ? Math.sin(t * 1.6 - i * 0.55) : 0;
          const curl = 1 + 0.2 * wave + 0.9 * agit;
          const len = (14 + Math.sin((i + 0.5) / count * Math.PI) * 42 * (1 - i * 0.03)) * k * (1 + 0.1 * wave);
          [1, -1].forEach((sg, r) => {
            const a0 = ta - sg * Math.PI / 2;
            const sx = p.x + Math.cos(a0) * (half + 6 * k), sy = p.y + Math.sin(a0) * (half + 6 * k);
            const P = tendrilPts(sx, sy, lean(a0, sx, sy), len, (v) => sg * (2.4 + 7 * v * v * v) * curl, 10);
            setPoly(b.ribs[r], P);
            const n = P.length;
            setDot(b.tips[r], P[n - 2], P[n - 1], (o.eyes ? (c.now < b.blinkUntil ? 0.4 : 2.2) : 1.6) * S);
          });
        } else {
          // Quill: small brackets on the spine, two pairs of barbs that flutter.
          const half = 6 * k;
          glyphAt(b.brackets[0], p.x + Math.cos(ta + Math.PI / 2) * half, p.y + Math.sin(ta + Math.PI / 2) * half, 13 * k * 0.8, ta - Math.PI / 2);
          glyphAt(b.brackets[1], p.x + Math.cos(ta - Math.PI / 2) * half, p.y + Math.sin(ta - Math.PI / 2) * half, 13 * k * 0.8, ta - Math.PI / 2);
          setDot(b.core, p.x, p.y, 1.2 * k * fat);
          const flutter = (c.alive ? Math.sin(t * 3 - i * 0.6) * 0.16 : 0) + agit * 0.35;
          const len = (18 + Math.sin(i / Math.max(1, count - 1) * Math.PI) * 34) * k;
          let r = 0;
          [-1, 1].forEach((sg) => [0, 1].forEach((ph) => {
            const a = ta - sg * (Math.PI / 2 - (40 + ph * 22) * Math.PI / 180) - sg * flutter;
            const sx = p.x + Math.cos(ta - sg * Math.PI / 2) * 8 * k, sy = p.y + Math.sin(ta - sg * Math.PI / 2) * 8 * k;
            const P = tendrilPts(sx, sy, lean(a, sx, sy), len * (ph ? 0.7 : 1), (v) => -sg * 0.5 * v, 6);
            setPoly(b.ribs[r], P);
            setDot(b.tips[r], P[P.length - 2], P[P.length - 1], 1.4 * S);
            r++;
          }));
        }
      });
      if (spineLine) {
        setPoly(spineLine, spine.slice(0, count).flatMap((p) => [p.x, p.y]));
        const end = spine[count - 1], ta = tailAng(count - 1);
        const P = tendrilPts(end.x, end.y, ta, 34 * k, (v) => -(3 + 10 * v * v) * (0.75 + 0.25 * Math.sin(t * 1.7)), 12);
        setPoly(tail, P);
      }
    };

    c.emerge = (x, y, heading) => {
      c.B.x = x; c.B.y = y;
      c.V.x = c.V.y = 0;
      c.heading = c.wanderA = heading;
      grow = 0.2;
      count = o.bones;
      arms.forEach((a) => { a.lost = false; a.len = o.armLen; });
      Object.assign(c, { visible: true, alive: true, dead: false, dest: null, spot: null, nextStalk: 0, eaten: 0, bulges: [] });
      straighten();
    };
    c.setHome = (x, y, scale) => {
      c.home.x = x; c.home.y = y;
      S = scale;
      if (!c.alive && c.visible) { c.B.x = x; c.B.y = y; c.heading = c.restHeading; straighten(); }
    };
    c.teleport = (dx, dy) => {
      c.B.x += dx; c.B.y += dy;
      for (const p of spine) { p.x += dx; p.y += dy; }
      for (const a of arms) for (const p of a.pts) { p.x += dx; p.y += dy; }
    };
    c.gatherAt = (x, y) => c.teleport(x - c.B.x, y - c.B.y);

    // A bite cuts the spine (everything behind it falls off) or an arm.
    c.hurt = (now, p) => {
      c.hurtUntil = now + 900;
      p = p || c.B;
      if (brace) {
        let best = null;
        for (const a of arms) {
          if (a.lost) continue;
          for (let j = 1; j < a.len; j++) {
            const d = dist(p, a.pts[j]);
            if (!best || d < best.d) best = { a, j: Math.max(1, j), d };
          }
        }
        if (best) {
          const a = best.a;
          spawnDebris(a.pts.slice(best.j, a.len), c.B, now, 3);
          a.chars.slice(best.j - 1, a.len - 1).forEach((el) => spawnLetter(el.textContent, +el.getAttribute('x'), +el.getAttribute('y'), null, now, DEBRIS_MS, c.B));
          a.len = best.j;
          if (a.len < 3) a.lost = true;
        }
        if (arms.filter((a) => !a.lost).length < 2) c.dead = true;
        return;
      }
      let j = count - 1, bd = Infinity;
      for (let i = 1; i < count; i++) {
        const d = dist(p, spine[i]);
        if (d < bd) { bd = d; j = i; }
      }
      spawnDebris(spine.slice(j, count), c.B, now, 3);
      for (let i = j; i < count; i++) {
        bones[i].ribs.forEach((el) => {
          const v = (el.getAttribute('points') || '').trim().split(/\s+/).map(Number), pts = [];
          for (let q = 0; q + 1 < v.length; q += 2) pts.push({ x: v[q], y: v[q + 1] });
          spawnDebris(pts, c.B, now, 3);
        });
        bones[i].brackets.forEach((el) => spawnLetter(el.textContent, +el.getAttribute('x'), +el.getAttribute('y'), null, now, DEBRIS_MS, c.B));
      }
      count = j;
      if (count < 3) c.dead = true;
    };

    c.parts = () => (brace ? [c.B].concat(arms.filter((a) => !a.lost).map((a) => a.pts[a.len >> 1])) : spine.slice(1, count));
    c.body = () => (brace ? arms.filter((a) => !a.lost).map((a) => a.pts[a.len - 1]).concat(c.B) : spine.slice(0, count));
    c.wake = () => { c.alive = true; c.nextMood = 0; c.nextStalk = 0; c.dest = c.spot = null; };
    c.sleep = () => { c.alive = false; c.stalkUntil = c.clingUntil = 0; c.foe = null; c.dest = c.spot = null; };
    c.reset = () => {
      count = o.bones;
      arms.forEach((a) => { a.lost = false; a.len = o.armLen; });
      Object.assign(c, { eaten: 0, bulges: [], dead: false, throwV: null, clingUntil: 0 });
    };
    c.settled = () => !c.bulges.length && grow === 1 && c.now >= c.hurtUntil && agit === 0 &&
      Math.hypot(c.B.x - c.home.x, c.B.y - c.home.y) < 0.3 && Math.hypot(c.V.x, c.V.y) < 0.05;
    c.label = () => (brace ? arms.filter((a) => !a.lost).length + ' ARMS' : count + ' BONES');
    return c;
  }

  // ---- Life cycle: five forms, with a pupa between each ----------------------
  // To the rest of the page this is one creature. Inside, it is one of its
  // forms or a pupa, and it hands every call to whichever one it is now.
  // `stages` is a list of { form, evolveAt, splitAt } from first to last form.
  // opts.mutant: it has no nest, and when it dies it is gone for good.
  function makeLifeCycle(svg, stages, opts) {
    opts = opts || {};
    const pupa = makePupa(svg, PUPA);
    const forms = stages.map((st) => st.form);
    const young = forms[0];
    forms.slice(1).forEach((f) => { f.visible = false; });
    let stage = 0;
    let form = young;
    let gone = false, rebirthAt = 0, hatching = false, token = 0;
    const c = {
      hits: forms.flatMap((f) => f.hits).concat(pupa.hits),
      mutant: !!opts.mutant, kind: opts.kind || null, removed: false,
      fond: 0, fondOn: false, nextGift: 0
    };
    forms.concat(pupa).forEach((f) => { f.owner = c; });
    for (const key of ['name', 'B', 'V', 'immune']) {
      Object.defineProperty(c, key, { get: () => form[key] });
    }
    Object.defineProperty(c, 'alive', { get: () => !gone && form.alive });
    Object.defineProperty(c, 'mood', { get: () => (gone ? (hatching ? 'HATCHING' : 'DEAD') : form.mood) });
    Object.defineProperty(c, 'form', { get: () => form });
    Object.defineProperty(c, 'stage', { get: () => stage + 1 });
    Object.defineProperty(c, 'gone', { get: () => gone });

    function hideAll() {
      for (const f of forms.concat(pupa)) {
        f.sleep();
        if (f.carry) dropCarry(f);
        f.visible = false;
        f.alive = false;
      }
    }

    function toPupa(now) {
      const cur = forms[stage];
      dropCarry(cur);
      pupa.begin(cur.body(), cur.B.x, cur.B.y, cur.heading, now, 1 + stage * 0.35);
      cur.sleep();
      cur.visible = false;
      form = pupa;
    }

    function hatch() {
      stage++;
      forms[stage].emerge(pupa.B.x, pupa.B.y, pupa.heading);
      pupa.visible = false;
      pupa.alive = false;
      form = forms[stage];
    }

    // Killed: it falls apart (the pieces are food for 5 seconds) and is gone.
    // A nest creature hatches again later, out of a word on the page.
    function die(now) {
      shatter(form, now);
      hideAll();
      forms.forEach((f) => f.reset());
      stage = 0;
      form = young;
      gone = true;
      hatching = false;
      if (c.mutant) c.removed = true;
      else rebirthAt = now + 9000 + Math.random() * 8000;
    }

    // A fifth form that has eaten enough splits: it dies, and two mutants
    // crawl out of the pieces.
    function split(now) {
      const x = form.B.x, y = form.B.y;
      die(now);
      if (ERO.onSplit) ERO.onSplit(c, x, y);
    }

    // Come alive at (x, y) as the first form (used for hatching and new mutants).
    c.bornAt = (x, y) => {
      gone = false;
      hatching = false;
      stage = 0;
      form = young;
      young.emerge(x, y, Math.random() * Math.PI * 2);
    };

    c.step = (now, env) => {
      if (gone) {
        if (!c.mutant && !hatching && now > rebirthAt) {
          const w = ERO.hatchWord ? ERO.hatchWord() : null;
          if (!w) { rebirthAt = now + 3000; return; }
          hatching = true;
          const mine = token;
          ERO.debris.hatch(w, now, (x, y) => { if (mine === token) c.bornAt(x, y); });
        }
        return;
      }
      form.step(now, env);
      const st = stages[stage];
      if (form.dead) {
        die(now);
      } else if (form === pupa) {
        if (pupa.done(now)) hatch();
      } else if (form.alive && st.evolveAt && form.eaten >= st.evolveAt) {
        toPupa(now);
      } else if (form.alive && st.splitAt && form.eaten >= st.splitAt) {
        split(now);
      }
    };

    // Shortcuts for testing in the console, for example:
    //   ERO.creatures.snake.evolve()  curls up into the next pupa now
    //   ERO.creatures.snake.hatch()   skips straight to the next form
    //   ERO.creatures.snake.split()   a fifth form splits into two mutants now
    c.evolve = () => {
      if (gone || form === pupa || stage >= forms.length - 1) return;
      if (!form.alive) form.wake();
      toPupa(performance.now());
      kick();
    };
    c.hatch = () => {
      if (form !== pupa) c.evolve();
      if (form === pupa) hatch();
      kick();
    };
    c.split = () => {
      if (gone || form === pupa || stage < forms.length - 1) return;
      split(performance.now());
      kick();
    };
    c.kill = () => { if (!gone) { form.dead = true; kick(); } };

    c.draw = () => { forms.forEach((f) => f.draw()); pupa.draw(); };
    c.setHome = (x, y, scale) => { forms.concat(pupa).forEach((f) => f.setHome(x, y, scale)); };
    c.teleport = (dx, dy) => form.teleport(dx, dy);
    c.mouthAt = () => (form.mouth ? form.mouth() : form.B);
    c.fling = (vx, vy) => form.fling(vx, vy);
    c.wake = () => {
      if (gone) { rebirthAt = 0; return; } // dead: hatch again right away
      form.wake();
    };
    c.sleep = () => {
      if (gone) return;
      if (form === pupa) hatch(); // a pupa can't walk home, so it hatches first
      form.sleep();
    };
    // Dead nest creatures keep the loop going until they hatch again.
    c.settled = () => (gone ? c.mutant : form.settled());
    c.label = () => {
      if (gone) return hatching ? 'CRACKING A WORD' : 'WILL HATCH AGAIN';
      if (form === pupa) return pupa.label();
      const st = stages[stage], left = (n) => Math.max(0, n - form.eaten);
      return 'STAGE ' + (stage + 1) + ' / ' + form.label() + ' / ' +
        (st.evolveAt ? left(st.evolveAt) + ' TO PUPA' : st.splitAt ? left(st.splitAt) + ' TO SPLIT' : form.eaten + ' EATEN');
    };

    // How far it is toward its next change: { eaten, at, next: 'PUPA' | 'SPLIT' | null }.
    c.progress = () => {
      if (gone || form === pupa) return { eaten: 0, at: 0, next: null };
      const st = stages[stage];
      return { eaten: form.eaten, at: st.evolveAt || st.splitAt || 0, next: st.evolveAt ? 'PUPA' : st.splitAt ? 'SPLIT' : null };
    };
    c.stages = stages.length;

    // PURGE: whatever it has become shrinks back into the young form, asleep.
    c.reset = () => {
      token++;
      if (gone) {
        gone = false;
        hatching = false;
        young.visible = true;
        young.gatherAt(young.home.x, young.home.y);
      } else if (form !== young) {
        young.gatherAt(form.B.x, form.B.y);
        hideAll();
        young.visible = true;
        form = young;
      }
      if (form.carry) dropCarry(form);
      stage = 0;
      young.sleep();
      forms.forEach((f) => f.reset());
      c.fond = 0;
      c.fondOn = false;
    };
    // Take it off the page for good (mutants, on PURGE or death).
    c.destroy = () => {
      hideAll();
      forms.concat(pupa).forEach((f) => { f.g.remove(); if (f.carryEl) f.carryEl.remove(); });
      c.removed = true;
    };
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
    breaks: 3,               // body lines bitten through before it dies
    evolveAt: 20,            // food eaten before it curls into a pupa
    tune: { cruise: 1.5, flee: 7.5, fleeRadius: 190, turn: 0.3, pauseChance: 0.12, roam: 1.4, fightRange: 260, aggression: 0.3 }
  };

  // The crawler's adult form: bigger, with two pincers, six legs and a curled
  // stinger tail.
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
    slots: [[1, 2, 24], [3, 4, 76], [5, 6, 104], [7, 8, 132]],
    claws: [0],
    growOrder: [0, 1, 2, 3],
    startPairs: 4,
    maxPairs: 4,
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
    breaks: 4,
    evolveAt: 30,
    tails: [{ from: 11, count: 10, seg: 11, curl: 0.3, stinger: true }],
    tune: { cruise: 1.8, flee: 7, fleeRadius: 160, turn: 0.25, pauseChance: 0.1, roam: 1.4, fightRange: 300, aggression: 0.5 }
  };

  // The scorpion's final form: huge, four pincers, mandibles, three stingers.
  const EMPEROR = Object.assign({}, SCORPION, {
    name: 'EMPEROR',
    size: 1.75,
    slots: [[1, 2, 14], [1, 2, 36], [3, 4, 72], [5, 6, 96], [7, 8, 118], [9, 10, 140]],
    claws: [0, 1],
    growOrder: [0, 1, 2, 3, 4, 5],
    startPairs: 6,
    maxPairs: 6,
    reach: 112,
    dotR: 4.4,
    biteGap: 500,
    unfold: 0.015,
    breaks: 5,
    evolveAt: 0,
    mandibles: true,
    tails: [
      { from: 11, count: 11, seg: 12, curl: 0.3, stinger: true },
      { from: 11, count: 11, seg: 12, curl: -0.3, stinger: true },
      { from: 11, count: 13, seg: 12, curl: 0.05, stinger: true }
    ],
    tune: { cruise: 1.9, flee: 6.5, fleeRadius: 130, turn: 0.22, pauseChance: 0.1, roam: 1.4, fightRange: 340, aggression: 0.6 }
  });

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
    // Demo 07: two-part legs and a shorter reach (the three-joint legs of
    // demo 06 were heavy and could glitch).
    segments: 2,
    seg: [0.72],
    reach: 64,
    gait: 'tetrapod',
    stepMs: 260, minStepMs: 90,
    damping: 0.88, spring: 0.14, stiff: 0.4, iterations: 2, breathe: 0.2,
    dotR: 3,
    biteGap: 1100,
    breaks: 3,
    evolveAt: 16,
    tune: { cruise: 1.8, flee: 8, fleeRadius: 210, turn: 0.22, pauseChance: 0.15, roam: 1.4, fightRange: 260, aggression: 0.25 }
  };

  // The strider's adult form: a giant on 10 legs, with mandibles and a silk
  // thread trailing from its abdomen.
  const COLOSSUS = {
    name: 'COLOSSUS',
    size: 1.6,
    body: [
      [14, 0], [9, -7], [9, 7], [1, -9], [1, 9], [-7, -7],
      [-7, 7], [-11, 0], [-20, -10], [-20, 10], [-34, 0]
    ],
    lines: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 7], [7, 8], [7, 9], [8, 10], [9, 10], [8, 9]],
    braces: [[0, 3], [0, 4], [1, 2], [3, 4], [5, 6], [1, 5], [2, 6], [3, 6], [4, 5], [7, 10], [0, 7]],
    slots: [[1, 2, 40], [3, 4, 70], [3, 4, 98], [5, 6, 124], [5, 6, 150]],
    growOrder: [0, 1, 2, 3, 4],
    startPairs: 5,
    maxPairs: 5,
    gripsPerPair: 0,
    legGrowth: 0,
    segments: 2,
    seg: [0.74],
    reach: 82,
    gait: 'tetrapod',
    stepMs: 280, minStepMs: 100,
    damping: 0.88, spring: 0.14, stiff: 0.4, iterations: 2, breathe: 0.2,
    dotR: 3.6,
    biteGap: 900,
    unfold: 0.015,
    breaks: 4,
    evolveAt: 26,
    mandibles: true,
    tails: [{ from: 10, count: 16, seg: 10, silk: true }],
    tune: { cruise: 2.1, flee: 8, fleeRadius: 170, turn: 0.2, pauseChance: 0.12, roam: 1.4, fightRange: 320, aggression: 0.45 }
  };

  // The colossus's next form: 12 legs and three silk threads.
  const BROODMOTHER = Object.assign({}, COLOSSUS, {
    name: 'BROODMOTHER',
    size: 2,
    slots: [[1, 2, 34], [1, 2, 56], [3, 4, 78], [3, 4, 100], [5, 6, 124], [5, 6, 148]],
    growOrder: [0, 1, 2, 3, 4, 5],
    startPairs: 6,
    maxPairs: 6,
    reach: 92,
    dotR: 4,
    biteGap: 800,
    unfold: 0.012,
    breaks: 5,
    evolveAt: 0,
    tails: [
      { from: 8, count: 18, seg: 10, silk: true },
      { from: 10, count: 22, seg: 10, silk: true },
      { from: 9, count: 18, seg: 10, silk: true }
    ],
    tune: { cruise: 2.2, flee: 7.5, fleeRadius: 140, turn: 0.2, pauseChance: 0.12, roam: 1.4, fightRange: 360, aggression: 0.55 }
  });

  // ---- Demo 07 stand-in forms (stages 4 and 5) ----

  // Crawler stage 4: fewer legs, but thick ones. Two big pincers, mandibles,
  // and three tails that end in pincers instead of stingers.
  const WARLORD = Object.assign({}, EMPEROR, {
    name: 'WARLORD',
    size: 2.1,
    heavy: true,
    slots: [[1, 2, 18], [3, 4, 84], [7, 8, 128]],
    claws: [0],
    growOrder: [0, 1, 2],
    startPairs: 3,
    maxPairs: 3,
    reach: 120,
    dotR: 5,
    stepMs: 300, minStepMs: 120,
    breaks: 6,
    mandibles: true,
    tails: [
      { from: 11, count: 10, seg: 13, curl: 0.28, claw: true },
      { from: 11, count: 10, seg: 13, curl: -0.28, claw: true },
      { from: 11, count: 12, seg: 13, curl: 0.04, claw: true }
    ],
    tune: { cruise: 1.6, flee: 6, fleeRadius: 120, turn: 0.2, pauseChance: 0.1, roam: 1.4, fightRange: 360, aggression: 0.65 }
  });

  // Crawler stage 5: its body is made of letters it has eaten, five stingers.
  const THRONE = Object.assign({}, WARLORD, {
    name: 'THRONE',
    size: 2.4,
    glyphBody: 'EROSIONTHRONE',
    slots: [[1, 2, 18], [5, 6, 96], [9, 10, 136]],
    reach: 132,
    tails: [-0.5, -0.25, 0, 0.25, 0.5].map((curl, i) => ({ from: 11, count: 9 + (i % 2) * 3, seg: 12, curl, stinger: true })),
    tune: { cruise: 1.5, flee: 5.5, fleeRadius: 100, turn: 0.2, pauseChance: 0.12, roam: 1.4, fightRange: 380, aggression: 0.7 }
  });

  // Strider stage 4: spins a web of silk between the letters it walks on.
  const WEAVER = Object.assign({}, BROODMOTHER, {
    name: 'WEAVER',
    size: 2.2,
    slots: [[1, 2, 40], [3, 4, 70], [3, 4, 98], [5, 6, 124], [5, 6, 150]],
    growOrder: [0, 1, 2, 3, 4],
    startPairs: 5,
    maxPairs: 5,
    reach: 96,
    web: 10,
    tails: [{ from: 10, count: 20, seg: 10, silk: true }],
    tune: { cruise: 2, flee: 7, fleeRadius: 130, turn: 0.2, pauseChance: 0.18, roam: 1.4, fightRange: 360, aggression: 0.5 }
  });

  // Strider stage 5: huge, on eight legs written in bracket characters.
  const CATHEDRAL = Object.assign({}, COLOSSUS, {
    name: 'CATHEDRAL',
    size: 2.6,
    slots: [[1, 2, 44], [3, 4, 84], [5, 6, 116], [5, 6, 148]],
    growOrder: [0, 1, 2, 3],
    startPairs: 4,
    maxPairs: 4,
    reach: 112,
    glyphLegs: '()[]{}<>',
    legChars: 9,
    dotR: 4.4,
    breaks: 6,
    tails: [
      { from: 8, count: 16, seg: 11, silk: true },
      { from: 10, count: 20, seg: 11, silk: true },
      { from: 9, count: 16, seg: 11, silk: true }
    ],
    tune: { cruise: 1.7, flee: 6, fleeRadius: 110, turn: 0.18, pauseChance: 0.12, roam: 1.4, fightRange: 380, aggression: 0.6 }
  });

  const SNAKE = {
    maxLen: 44,
    startLen: 18,
    minLen: 6,        // cut down to this many segments, it dies
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
    curlSeconds: 1.2, // how long the creature takes to curl into the egg
    dots: 18,         // dots around the egg
    length: 34,       // half-length of the egg (the second pupa is 1.5x)
    width: 23,        // half-width of the egg
    tears: 4          // bites that tear it open (and kill it)
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
    evolveAt: 30,
    tune: {
      cruise: 2.2, flee: 9, fleeRadius: 220, turn: 0.2, pauseChance: 0.05, roam: 1.4,
      fightRange: 300, aggression: 0.45,
      wiggle: 0.35, wavelength: 170 // a gentler, fish-like swing
    }
  };

  const ELDER = {
    name: 'OLD ONE',
    radius: 30,       // body size (it bulges out to 1.45x behind)
    ring: 16,         // dots round the body
    arms: 10, armLen: 30, tseg: 9, armReach: 70, armHoldMs: 2500,
    face: 8, faceLen: 9, faceSeg: 7, faceReach: 40, faceHoldMs: 700,
    fan: 0.5, faceFan: 1.6,
    wing: 75,         // length of the longest wing bone
    claw: 12,
    reachMs: 260,
    mouthGap: 500,
    tune: {
      cruise: 1.5, flee: 6, fleeRadius: 140, turn: 0.18, pauseChance: 0.08, roam: 1.4,
      fightRange: 340, aggression: 0.6, wiggle: 0.2, wavelength: 220
    }
  };

  // Snake stage 4: an old one dragging a second, smaller body on a chain.
  const LEVIATHAN = Object.assign({}, ELDER, {
    name: 'LEVIATHAN',
    radius: 34,
    arms: 8, face: 6,
    wing: 95,
    tailBody: { links: 22, seg: 13, ring: 12, radius: 20, arms: 5, armLen: 18 },
    tune: { cruise: 1.4, flee: 5.5, fleeRadius: 120, turn: 0.16, pauseChance: 0.08, roam: 1.4, fightRange: 360, aggression: 0.65, wiggle: 0.2, wavelength: 240 }
  });

  // Snake stage 5: a huge spine of bracket vertebrae (crawl_33) covered in eyes.
  const ABYSS = {
    name: 'ABYSS', kind: 'ribs', bones: 12, size: 1.8, seg: 20, eyes: true, biteGap: 450,
    tune: { cruise: 1.4, flee: 5, fleeRadius: 100, turn: 0.18, pauseChance: 0.08, roam: 1.4, fightRange: 380, aggression: 0.7, wiggle: 0.25, wavelength: 260 }
  };

  // Mutants: small glyph creatures that crawl out of a splitting fifth form
  // (or hatch out of a word). Five levels, each bigger and more complex.
  const MUTANTS = { ribs: 'RIBS', brace: 'BRACE', quill: 'QUILL' };
  function mutantForm(kind, L) {
    return {
      name: MUTANTS[kind] + ' L' + L, kind,
      size: 0.5 + L * 0.13,
      bones: kind === 'quill' ? 4 + Math.round(L * 1.5) : 3 + L, // vertebrae (or arms)
      seg: kind === 'ribs' ? 20 : 14,
      armLen: 7 + L * 2, tseg: 8,
      biteGap: 800 - L * 60,
      tune: {
        cruise: 1.6 + L * 0.1, flee: 7, fleeRadius: 180, turn: 0.25, pauseChance: 0.1, roam: 1.4,
        fightRange: 200 + L * 25, aggression: 0.15 + L * 0.07,
        wiggle: kind === 'brace' ? 0 : 0.3, wavelength: 160
      }
    };
  }
  ERO.mutantKinds = Object.keys(MUTANTS);
  ERO.makeMutant = (svg, kind) => {
    kind = kind || ERO.mutantKinds[Math.floor(Math.random() * ERO.mutantKinds.length)];
    return makeLifeCycle(svg, [1, 2, 3, 4, 5].map((L) => ({
      form: makeGlyph(svg, mutantForm(kind, L)),
      evolveAt: L < 5 ? 8 + L * 3 : 0,
      splitAt: L === 5 ? 26 : 0
    })), { mutant: true, kind });
  };

  ERO.makeCrawler = (svg, opts) => makeLifeCycle(svg, [
    { form: makeSpider(svg, CRAWLER), evolveAt: 20 },
    { form: makeSpider(svg, SCORPION), evolveAt: 30 },
    { form: makeSpider(svg, EMPEROR), evolveAt: 36 },
    { form: makeSpider(svg, WARLORD), evolveAt: 40 },
    { form: makeSpider(svg, THRONE), splitAt: 45 }
  ], opts); // opts.mutant: no nest, gone for good when it dies
  ERO.makeStrider = (svg, opts) => makeLifeCycle(svg, [
    { form: makeSpider(svg, STRIDER), evolveAt: 16 },
    { form: makeSpider(svg, COLOSSUS), evolveAt: 26 },
    { form: makeSpider(svg, BROODMOTHER), evolveAt: 32 },
    { form: makeSpider(svg, WEAVER), evolveAt: 38 },
    { form: makeSpider(svg, CATHEDRAL), splitAt: 44 }
  ], opts); // opts.mutant: no nest, gone for good when it dies
  ERO.makeSnake = (svg, opts) => makeLifeCycle(svg, [
    { form: makeSnake(svg, SNAKE), evolveAt: 20 },
    { form: makeSquid(svg, SQUID), evolveAt: 30 },
    { form: makeElder(svg, ELDER), evolveAt: 36 },
    { form: makeElder(svg, LEVIATHAN), evolveAt: 40 },
    { form: makeGlyph(svg, ABYSS), splitAt: 45 }
  ], opts); // opts.mutant: no nest, gone for good when it dies
})();
