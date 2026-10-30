/*
  EROSION.EXE demo 12: the creatures.

  Demo 12 (owner, 29 Oct 2026): legged creatures have 4 to 6 legs (no more
  eights), a pupa squirms more (ripples and sudden twitches) the closer it
  gets to hatching, and ERO.catalog lists every line and stage so a page
  can summon any of them (the Archive does). Pupas could already be bitten
  and torn open by creatures and by your double-click (PUPA.tears).

  Demo 11:

  Demo 11 adds two ways of showing how they feel about you:
  - TALKING: a creature that is fond of you now and then "speaks" a burst
    of gibberish (like #&&[1j) next to its mouth, typed out one sign at a
    time, and turns to face you while it does (mood TALKING TO YOU).
  - RUNNING AWAY: a creature you hurt (double-click, ERO.zap) bolts away
    from you for a few seconds (mood FLEEING), and often makes for the
    nearest link to another page and escapes through it.

  Demo 10 gave the glyph crawlers five made-up stages each (MUTANT_STAGES).
  Demo 09 added TRAVEL between pages:

  Demo 09 adds TRAVEL between pages (ERO.travel, at the bottom of this file):
  a wild creature now and then walks into a link to another Erosion page
  and slips through it, and a creature that is fond of you follows you when
  you click a link. The browser keeps what it was (its line, form, food and
  fondness) until the tab is closed, and it comes out on the page it went
  to: out of the link back to where it came from, or out of a word.
  The page's runner (page.js, archive.js) lets it in; PURGE forgets them all.

  Demo 08 added ZAP: a visitor double-clicks a creature to damage it. The
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
  const EXIT_CHANCE = 0.04;  // chance a wild one heads for a link to another page
  const FOND_MS = 12000;     // time near you before it is fully fond of you
  const SAY_MS = [7000, 16000]; // a fond creature speaks this often
  const SAY_LIFE = 2600;        // how long a burst of gibberish stays up
  const SCARED_MS = 5000;       // how long a hurt creature runs away
  const BOLT_CHANCE = 0.6;      // chance a hurt one tries to escape through a link
  const BABBLE = '#&&[]{}<>/|*%$@!?;:~^=+1jx0';

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
    return debris[debris.length - 1];
  }

  // Food a visitor dropped: a word lying on the page. It is a piece of
  // debris like any other (creatures come and eat it), with the word on it.
  function spawnFood(text, x, y, now) {
    const half = Math.max(6, text.length * 4);
    const d = spawnDebris([{ x: x - half, y: y + 3 }, { x: x + half, y: y + 3 }], { x, y: y - 10 }, now, 0, 25000);
    if (!d) return null;
    d.vx = d.vy = d.spin = 0;
    d.byHand = true;
    d.label = make(layer(), 'text', 'ero-dropped ero-food');
    d.label.textContent = text;
    return d;
  }

  function removePiece(i) {
    const d = debris[i];
    d.el.remove();
    d.dots.forEach((e) => e.remove());
    if (d.label) d.label.remove();
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

  // ---- Gibberish: what a fond creature says to you ---------------------------
  // Typed out one sign at a time beside its mouth, a sign or two flickering
  // to another one, then fading. It follows the creature as it moves.
  const speeches = [];
  function babble() {
    let t = '';
    const n = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) t += BABBLE[Math.floor(Math.random() * BABBLE.length)];
    return t;
  }
  function say(c, now) {
    if (!svgRoot) return;
    speeches.filter((sp) => sp.c === c).forEach((sp) => { sp.born = -1e9; }); // one at a time
    const el = make(layer(), 'text', 'ero-speech');
    speeches.push({ c, el, text: babble(), born: now });
  }
  function drawSpeech(now) {
    for (let i = speeches.length - 1; i >= 0; i--) {
      const sp = speeches[i], age = now - sp.born;
      if (age > SAY_LIFE || !sp.c.visible || sp.c.dead) { sp.el.remove(); speeches.splice(i, 1); continue; }
      if (age > 700 && Math.random() < 0.05) {
        const k = Math.floor(Math.random() * sp.text.length);
        sp.text = sp.text.slice(0, k) + BABBLE[Math.floor(Math.random() * BABBLE.length)] + sp.text.slice(k + 1);
      }
      const typed = Math.min(sp.text.length, Math.floor(age / 80));
      sp.el.textContent = sp.text.slice(0, typed) + (typed < sp.text.length ? '_' : '');
      const m = sp.c.mouth ? sp.c.mouth() : sp.c.B;
      sp.el.setAttribute('x', (m.x + 12).toFixed(1));
      sp.el.setAttribute('y', (m.y - 14).toFixed(1));
      sp.el.setAttribute('opacity', clamp((SAY_LIFE - age) / 500, 0, 1).toFixed(2));
    }
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
    // It runs from where it was hit, and maybe out of the page.
    f.scaredUntil = now + SCARED_MS;
    f.scaredFrom = { x: p.x, y: p.y };
    f.bolt = Math.random() < BOLT_CHANCE;
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
      drawSpeech(now);
      for (const d of debris) {
        const age = now - d.born;
        const fade = fadeOf(age, d.life).toFixed(2);
        const hurt = age < 700 && Math.floor(age / 170) % 2 === 0;
        setPoly(d.el, d.pts.flatMap((p) => [p.x, p.y]));
        d.el.setAttribute('opacity', fade);
        if (d.label) {
          const q = pieceCentre(d);
          d.label.setAttribute('x', (q.x - d.label.textContent.length * 4).toFixed(1));
          d.label.setAttribute('y', q.y.toFixed(1));
          d.label.setAttribute('opacity', fade);
        }
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
        const q = pieceCentre(d), dd = dist(p, q) / (d.byHand ? 2 : 1); // your food smells further
        if (dd < bd) { bd = dd; best = { piece: d, x: q.x, y: q.y }; }
      }
      return best;
    },
    eat(piece) {
      const i = debris.indexOf(piece);
      if (i >= 0) removePiece(i);
    },
    clearDrops() {
      drops.splice(0).forEach((el) => el.remove());
      speeches.splice(0).forEach((sp) => sp.el.remove());
    },
    hatch: startHatch,
    get hatching() { return hatches.length; },
    get active() { return debris.length > 0 || letters.length > 0 || hatches.length > 0 || speeches.length > 0; },
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
    const me = c.owner || c;
    c.dest = null;
    c.spot = null;
    c.exit = false;
    if (r < LINK_CHANCE) {
      c.dest = words.randomLink(c.B.y - h * 1.5, c.B.y + h * 1.5);
    } else if (r < LINK_CHANCE + EXIT_CHANCE && me.mutant && ERO.travel.on) {
      // Only wild ones leave by themselves; a nest creature stays in its room.
      c.dest = words.randomExit(c.B.y - h * 1.5, c.B.y + h * 1.5);
      c.exit = !!c.dest;
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

      // A fond creature now and then says something to you.
      if (fond && env.ptr.on) {
        if (!me.nextSay) me.nextSay = now + 2500 + Math.random() * 4000;
        else if (now > me.nextSay) {
          say(c, now);
          c.sayUntil = now + SAY_LIFE * 0.6;
          me.nextSay = now + SAY_MS[0] + Math.random() * (SAY_MS[1] - SAY_MS[0]);
        }
      }
      const talking = fond && now < (c.sayUntil || 0);

      // Hurt: run, and maybe make for the nearest way out of the page.
      const scared = now < (c.scaredUntil || 0);
      if (scared && c.bolt) {
        c.bolt = false;
        const out = ERO.travel.on ? words.nearestExit(c.B.x, c.B.y, 900 * s) : null;
        if (out) { c.dest = out; c.exit = true; c.spot = null; c.destUntil = now + SCARED_MS + 4000; }
      }
      if (!stalking && !fighting) {
        carryTo = carryGoal(c, me, now, env);
        gift = !carryTo && c.giftWord ? centre(c.giftWord) : null;
        if (!carryTo && !gift && now > c.nextScrap) {
          scrap = ERO.debris.near(mouth, 280 * s, now); // something dead to eat?
        }
      }

      // Head for the cursor, a foe, something it is carrying or hunting, or its destination.
      const busy = stalking || fighting || carryTo || gift || scrap || talking;
      if (!busy && (now > c.destUntil || (c.dest && c.dest.gone) || (!c.dest && !c.spot))) pickDest(c, now, env);
      if (c.spot && dist(c.spot, c.B) < 40 * s) pickDest(c, now, env);
      const lure = !busy && c.lure ? c.lure(now, env) : null;
      // A fond creature keeps close to you when it has nothing better to do.
      const stayClose = fond && env.ptr.on && !busy && !lure && dist(env.ptr, mouth) > 130 * s ? env.ptr : null;
      const fleeing = scared && !(c.exit && c.dest); // (one heading for a way out just goes there)
      const goal = fleeing ? null : talking ? env.ptr : stalking ? env.ptr : fighting ? aimPoint(c) : carryTo || gift || scrap || stayClose || lure ||
        (c.dest ? centre(c.dest) : c.spot);
      let goalDist = Infinity;
      if (goal) {
        // Steer so the mouth (not the middle of the body) ends up on the goal.
        const gx = goal.x - mouth.x, gy = goal.y - mouth.y;
        goalDist = Math.hypot(gx, gy) || 1;
        const pull = scared ? 3 : stalking || fighting ? 3 : carryTo || gift || scrap || stayClose ? 2.2 : P.roam;
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
      if (scared) {
        // Away from the cursor (or from where it was hit, if the cursor is gone).
        const from = env.ptr.on ? env.ptr : c.scaredFrom;
        const fx = c.B.x - from.x, fy = c.B.y - from.y;
        const d = Math.hypot(fx, fy) || 1;
        c.fear = 1;
        dx += (fx / d) * (c.exit && c.dest ? 1.5 : 5);
        dy += (fy / d) * (c.exit && c.dest ? 1.5 : 5);
      } else if (env.ptr.on && !stalking && !fond) {
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
      else if (talking) speed = goalDist > 90 * s ? P.cruise * s : 0; // stops and faces you
      else if (carryTo || gift || scrap || stayClose) speed = P.cruise * 1.4 * s * c.surge;
      else if (c.paused && c.fear === 0 && !lure) speed = 0;
      const accel = c.fear > 0 || stalking || fighting ? 0.25 : 0.07;
      c.V.x += ((dx / len) * speed - c.V.x) * accel;
      c.V.y += ((dy / len) * speed - c.V.y) * accel;
      if (talking && speed === 0) c.heading += wrap(Math.atan2(env.ptr.y - c.B.y, env.ptr.x - c.B.x) - c.heading) * 0.12;
      c.mood = scared ? (c.exit && c.dest ? 'ESCAPING' : 'FLEEING') : talking ? 'TALKING TO YOU' : stalking ? 'STALKING' : fighting ? (c.defending ? 'DEFENDING YOU' : 'FIGHTING')
        : c.fear > 0.25 ? 'SPOOKED' : carryTo ? (fond && env.ptr.on ? 'BRINGING A GIFT' : 'CARRYING')
        : gift ? 'FETCHING' : scrap ? 'SCAVENGING' : lure ? 'HUNTING' : fond ? 'FOND'
        : c.dest && c.exit ? 'LEAVING' : c.dest && c.dest.link ? 'TRAVELLING' : speed === 0 ? 'LURKING' : 'ROAMING';
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
      // Food from your hand: it likes you a bit more, and says so.
      if (scrap.piece.byHand) { me.fond = Math.min(1, me.fond + 0.2); say(c, now); }
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
      if (c.exit && door.page) {
        // An exit: it slips through to the other page (its life cycle sends it).
        door.el.classList.add('ero-portal');
        setTimeout(() => door.el.classList.remove('ero-portal'), 900);
        me.leaving = door.page;
        c.exit = false;
      } else if (to) {
        door.el.classList.add('ero-portal');
        setTimeout(() => door.el.classList.remove('ero-portal'), 900);
        c.teleport(to.x - mouth.x, to.y - mouth.y);
        c.destUntil = 0;
      } else if (!door.link && !door.door) {
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
    let jerkAt = 0, jerkDir = 1, nextJerk = 0; // sudden twitches inside
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
      nextJerk = now + 800;
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
      // Squirming: a ripple runs round the shell, and now and then something
      // inside jerks (more often, and harder, close to hatching).
      if (!still && now > nextJerk) {
        jerkAt = now;
        jerkDir = Math.random() < 0.5 ? -1 : 1;
        nextJerk = now + (700 + Math.random() * 1800) / build;
      }
      const jerk = still ? 0 : Math.max(0, Math.sin(Math.min(1, (now - jerkAt) / 260) * Math.PI)) * (now - jerkAt < 260 ? 1 : 0);
      const ripple = still ? 0 : 0.035 * build;
      const rock = still ? 0 : (Math.sin(t * 2.4) * 0.08 + Math.sin(t * 5.7) * 0.03) * build + jerk * jerkDir * 0.14;
      const squash = still ? 0 : Math.sin(t * 3.1) * 0.04 * build + jerk * 0.05;
      const a = c.heading + rock;
      const cs = Math.cos(a), sn = Math.sin(a);
      for (let i = 0; i < K; i++) {
        const ang = (i / K) * Math.PI * 2;
        // Egg: long along the body, a little pointier at the front.
        const bump = 1 + ripple * Math.sin(ang * 3 - t * 5) + jerk * 0.08 * Math.sin(ang * 2 + jerkDir);
        const lx = o.length * size * Math.cos(ang) * (1 + squash) * bump;
        const ly = o.width * size * Math.sin(ang) * (1 - 0.18 * Math.cos(ang)) * (1 - squash) * bump;
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
  // Demo 10 extras, used by the later stages of each line (all optional):
  //   o.glyphs   bracket pairs for the vertebrae (default all four kinds)
  //   o.crown    characters around the head: o.crownMode 'arc' (in front)
  //              or 'ring' (a slowly turning ring round a brace's hub)
  //   ribs:  o.pairs (rib pairs per bone, inner ones shorter and curling
  //          the other way), o.tail (a curled tail)
  //   brace: o.armText (the characters), o.rings (2 = short and long arms
  //          in turn), o.curl (how much the arms writhe), o.beads (dots)
  //   quill: o.barbs (barbs per side), o.branch (each barb forks),
  //          o.swish (length of a small swaying tail with a dot at the end),
  //          o.wings (two long feathers at the shoulders), o.tipText
  //          (letters instead of dots at the barb tips)
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
    const quill = o.kind === 'quill';
    const glyphs = o.glyphs || BRACKETS;
    const pairs = o.pairs || 1;               // ribs: rib pairs per bone
    const barbs = o.barbs || 2;               // quill: barbs per side
    const limbs = quill ? barbs * 2 : pairs * 2;
    const armText = o.armText || BRACE_TEXT;
    // Arm k's full length (with o.rings = 2, every other arm is short).
    const armFull = (k) => (o.rings === 2 && k % 2 ? Math.max(4, Math.round(o.armLen * 0.55)) : o.armLen);

    // ---- the parts, back to front ----
    const wings = quill && o.wings ? [0, 1].map(() => ({ line: make(g, 'polyline', 'ero-tendril'), tip: make(g, 'circle', 'dot') })) : [];
    const bones = brace ? [] : spine.map((_, i) => ({
      ribs: Array.from({ length: limbs }, () => make(g, 'polyline', quill ? 'ero-tendril' : 'limb')),
      subs: quill && o.branch ? Array.from({ length: limbs }, () => make(g, 'polyline', 'ero-tendril')) : [],
      tips: Array.from({ length: limbs }, () => make(g, 'circle', 'dot')),
      letters: quill && o.tipText ? Array.from({ length: limbs }, (_, r) => {
        const el = make(g, 'text', 'ero-glyph');
        el.textContent = o.tipText[(i * limbs + r) % o.tipText.length];
        return el;
      }) : [],
      brackets: [0, 1].map((k) => {
        const el = make(g, 'text', 'ero-glyph');
        el.textContent = glyphs[i % glyphs.length][k];
        return el;
      }),
      core: make(g, 'circle', 'dot'),
      blinkUntil: 0
    }));
    const spineLine = quill ? make(g, 'polyline', 'limb') : null;
    const tail = quill || o.tail ? make(g, 'polyline', 'limb') : null;
    const tailTip = o.swish ? make(g, 'circle', 'dot') : null;
    const arms = brace ? Array.from({ length: o.bones }, (_, k) => {
      const pts = Array.from({ length: armFull(k) }, () => ({ x: 0, y: 0 }));
      return {
        k, pts, len: pts.length, lost: false,
        chars: pts.slice(1).map((_, j) => {
          const el = make(g, 'text', 'ero-glyph');
          el.textContent = armText[(k % 4 + j) % armText.length];
          return el;
        }),
        beads: o.beads ? pts.slice(1).map((_, j) => (j % 3 === 2 ? make(g, 'circle', 'dot') : null)) : [],
        tip: make(g, 'circle', 'dot')
      };
    }) : [];
    const crown = (o.crown || '').split('').map((ch) => {
      const el = make(g, 'text', 'ero-glyph');
      el.textContent = ch;
      return el;
    });
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
        // (more arms fan out wider, up to a full bell)
        const spread = Math.min(2.3, 1.25 + Math.max(0, o.bones - 4) * 0.12);
        const at = c.heading + Math.PI + (arm.k / (o.bones - 1) - 0.5) * 2 * spread * (1 + 0.45 * agit);
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
          const sway = Math.sin(t * 2.2 + j * 0.5 + arm.k) * (0.5 + 0.4 * agit) * (o.curl || 1) * S;
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

    // The crown: characters in an arc in front of the head, or a ring that
    // turns slowly round a brace's hub.
    function drawCrown(t, k) {
      const n = crown.length;
      crown.forEach((el, i) => {
        const on = c.visible;
        show(el, on);
        if (!on) return;
        let a, r;
        if (o.crownMode === 'ring') {
          a = t * 0.4 + i / n * Math.PI * 2;
          r = 13 * k;
        } else {
          a = c.heading + (n > 1 ? (i / (n - 1) - 0.5) * 1.9 : 0);
          r = (o.kind === 'ribs' ? 22 : 13) * k;
        }
        const x = spine[0].x + Math.cos(a) * r, y = spine[0].y + Math.sin(a) * r;
        glyphAt(el, x, y, (o.crownSize || 11) * k, a + Math.PI / 2);
      });
    }

    c.draw = () => {
      if (!paint(c)) return;
      const t = c.now / 1000, k = grow * S * z;
      drawCrown(t, k);
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
          arm.beads.forEach((el, j) => {
            if (!el) return;
            const on = !arm.lost && j + 1 < arm.len;
            show(el, on);
            if (!on) return;
            const a = arm.pts[j + 1], b = arm.pts[Math.min(j + 2, arm.len - 1)];
            const nx = -(b.y - a.y), ny = b.x - a.x, d = Math.hypot(nx, ny) || 1;
            setDot(el, a.x + nx / d * 5 * k, a.y + ny / d * 5 * k, 1.3 * S);
          });
          show(arm.tip, !arm.lost);
          if (!arm.lost) setDot(arm.tip, arm.pts[arm.len - 1].x, arm.pts[arm.len - 1].y, 1.8 * S);
        });
        return;
      }

      bones.forEach((b, i) => {
        const on = i < count;
        b.ribs.concat(b.subs, b.tips, b.brackets, b.letters, [b.core]).forEach((el) => show(el, on));
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
          // Inner pairs are shorter and curl the other way (an S shape).
          for (let q = 0; q < pairs; q++) {
            const turn = q % 2 ? -0.8 : 1, short = [1, 0.62, 0.42][q] || 0.4;
            [1, -1].forEach((sg, side) => {
              const r = q * 2 + side;
              const a0 = ta - sg * Math.PI / 2 + sg * q * 0.35;
              const sx = p.x + Math.cos(a0) * (half + 6 * k), sy = p.y + Math.sin(a0) * (half + 6 * k);
              const P = tendrilPts(sx, sy, lean(a0, sx, sy), len * short, (v) => turn * sg * (2.4 + 7 * v * v * v) * curl, 10);
              setPoly(b.ribs[r], P);
              const n = P.length;
              setDot(b.tips[r], P[n - 2], P[n - 1], (o.eyes ? (c.now < b.blinkUntil ? 0.4 : 2.2) : 1.6) * S);
            });
          }
        } else {
          // Quill: small brackets on the spine, two pairs of barbs that flutter.
          const half = 6 * k;
          glyphAt(b.brackets[0], p.x + Math.cos(ta + Math.PI / 2) * half, p.y + Math.sin(ta + Math.PI / 2) * half, 13 * k * 0.8, ta - Math.PI / 2);
          glyphAt(b.brackets[1], p.x + Math.cos(ta - Math.PI / 2) * half, p.y + Math.sin(ta - Math.PI / 2) * half, 13 * k * 0.8, ta - Math.PI / 2);
          setDot(b.core, p.x, p.y, 1.2 * k * fat);
          const flutter = (c.alive ? Math.sin(t * 3 - i * 0.6) * 0.16 : 0) + agit * 0.35;
          const len = (18 + Math.sin(i / Math.max(1, count - 1) * Math.PI) * 34) * k;
          let r = 0;
          [-1, 1].forEach((sg) => { for (let ph = 0; ph < barbs; ph++) {
            const a = ta - sg * (Math.PI / 2 - (40 + ph * 22) * Math.PI / 180) - sg * flutter;
            const sx = p.x + Math.cos(ta - sg * Math.PI / 2) * 8 * k, sy = p.y + Math.sin(ta - sg * Math.PI / 2) * 8 * k;
            const P = tendrilPts(sx, sy, lean(a, sx, sy), len * ([1, 0.7, 0.5][ph] || 0.5), (v) => -sg * 0.5 * v, 6);
            setPoly(b.ribs[r], P);
            const n = P.length;
            if (b.subs.length) {
              // A fork from the middle of the barb, bending outward.
              const m = 6;
              const Q = tendrilPts(P[m], P[m + 1], a - sg * 0.7, len * 0.32, (v) => -sg * 0.8 * v, 4);
              setPoly(b.subs[r], Q);
            }
            if (b.letters.length) {
              show(b.tips[r], false);
              glyphAt(b.letters[r], P[n - 2], P[n - 1], 9 * k, a + Math.PI / 2);
            } else {
              setDot(b.tips[r], P[n - 2], P[n - 1], 1.4 * S);
            }
            r++;
          } });
        }
      });
      if (spineLine) setPoly(spineLine, spine.slice(0, count).flatMap((p) => [p.x, p.y]));
      if (tail) {
        const end = spine[count - 1], ta = tailAng(count - 1);
        // o.swish: a longer, thin tail that sways from side to side and ends
        // in a dot, instead of the tight curl.
        const P = o.swish
          ? tendrilPts(end.x, end.y, ta, o.swish * k, (v) => Math.sin(t * 2.4 - v * 3) * 1.6 * (c.alive ? 1 : 0.3) - 1.2 * v, 12)
          : tendrilPts(end.x, end.y, ta, (quill ? 34 : 46) * k, (v) => -(3 + 10 * v * v) * (0.75 + 0.25 * Math.sin(t * 1.7)), 12);
        setPoly(tail, P);
        if (tailTip) setDot(tailTip, P[P.length - 2], P[P.length - 1], 1.6 * S);
      }
      // Wings: two long feathers from the shoulders, beating slowly.
      wings.forEach((w, i) => {
        const on = count > 2;
        show(w.line, on); show(w.tip, on);
        if (!on) return;
        const sg = i ? 1 : -1, p = spine[1], ta = tailAng(1);
        const beat = c.alive ? Math.sin(t * 2.1) * 0.35 : 0;
        const a = ta - sg * (Math.PI / 2 - 0.5) - sg * beat;
        const P = tendrilPts(p.x, p.y, lean(a, p.x, p.y), 86 * k, (v) => -sg * (0.6 + 1.6 * v * v), 12);
        setPoly(w.line, P);
        setDot(w.tip, P[P.length - 2], P[P.length - 1], 1.8 * S);
      });
    };

    c.emerge = (x, y, heading) => {
      c.B.x = x; c.B.y = y;
      c.V.x = c.V.y = 0;
      c.heading = c.wanderA = heading;
      grow = 0.2;
      count = o.bones;
      arms.forEach((a) => { a.lost = false; a.len = a.pts.length; });
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
        bones[i].ribs.concat(bones[i].subs).forEach((el) => {
          const v = (el.getAttribute('points') || '').trim().split(/\s+/).map(Number), pts = [];
          for (let q = 0; q + 1 < v.length; q += 2) pts.push({ x: v[q], y: v[q + 1] });
          spawnDebris(pts, c.B, now, 3);
        });
        bones[i].brackets.concat(bones[i].letters).forEach((el) => spawnLetter(el.textContent, +el.getAttribute('x'), +el.getAttribute('y'), null, now, DEBRIS_MS, c.B));
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
      arms.forEach((a) => { a.lost = false; a.len = a.pts.length; });
      Object.assign(c, { eaten: 0, bulges: [], dead: false, throwV: null, clingUntil: 0 });
    };
    c.settled = () => !c.bulges.length && grow === 1 && c.now >= c.hurtUntil && agit === 0 &&
      Math.hypot(c.B.x - c.home.x, c.B.y - c.home.y) < 0.3 && Math.hypot(c.V.x, c.V.y) < 0.05;
    c.label = () => (brace ? arms.filter((a) => !a.lost).length + ' ARMS' : count + ' BONES');
    return c;
  }

  // ---- Siphon: a colony, after the siphonophores (demo 13) ------------------
  // Not one animal but a string of small ones on a single stem, drawn from
  // the owner's references (Sarsia siphonophora, physonect diagrams, hydra):
  //   POLYP  (o.mode 'polyp'): a hydra. A stalk with a crown of waving arms,
  //          and a bud on its side that grows as it eats.
  //   BELL   (o.mode 'bell'): Sarsia. A bell with a coiled tube inside, a
  //          long stem of tiny budding bells, and four long wavy tentacles.
  //   CHAIN, COLONY, ARMADA (o.mode 'colony'): a float at the front, pairs
  //          of numbered swimming bells behind it, then the stem with its
  //          repeating units: a bract, a feeding polyp and a fishing
  //          tentacle hung with beads.
  // It swims in pushes (the bells squeeze and open), and grows by budding:
  // every couple of words a new bell pair or unit appears, and at the end
  // of a stage it buds straight into the next one (no pupa). Its tentacle
  // tips snag the words they drift over. A bite cuts the stem (the units
  // behind fall off) or knocks off a bell.
  function makeSiphon(svg, o) {
    const c = base(o.name, o.tune, svg);
    const g = c.g;
    const z = o.size;
    let S = 1, grow = 1, phase = Math.random() * 6, pulse = 0;
    let count = o.len;                          // stem points left
    const spine = Array.from({ length: o.len }, () => ({ x: 0, y: 0 }));
    c.mouth = () => spine[0];
    const polyp = o.mode === 'polyp', bell = o.mode === 'bell', colony = o.mode === 'colony';
    const k = () => z * S * grow;
    const nect = colony ? o.pairs : 0;          // stem points taken by the swimming bells

    // ---- parts ----
    const stem = make(g, 'polyline', polyp ? 'limb ero-thick' : 'limb');
    const head = make(g, 'polyline', 'limb ero-thick');          // float or bell outline
    const tube = bell ? make(g, 'polyline', 'ero-tendril') : null; // coiled tube inside the bell
    const headDot = make(g, 'circle', 'dot');
    const arms = Array.from({ length: polyp ? o.arms : bell ? 4 : 0 }, () => ({
      line: make(g, 'polyline', 'ero-tendril'), tip: make(g, 'circle', 'dot')
    }));
    const foot = polyp ? make(g, 'polyline', 'limb ero-thick') : null;
    const bud = polyp ? { stalk: make(g, 'polyline', 'limb'), a: make(g, 'polyline', 'ero-tendril'), b: make(g, 'polyline', 'ero-tendril') } : null;
    const bells = Array.from({ length: nect * 2 }, (_, i) => {
      const t = make(g, 'text', 'ero-glyph');
      t.textContent = String(i + 1);
      return { box: make(g, 'polyline', 'limb'), num: t, lost: false };
    });
    // Units along the stem (colony), or tiny bells on the stem (Sarsia).
    const units = Array.from({ length: o.units || 0 }, () => ({
      bract: make(g, 'polyline', 'limb'),
      zooid: make(g, 'polyline', 'limb'),
      tent: make(g, 'polyline', 'ero-tendril'),
      beads: [0, 1, 2, 3].map(() => make(g, 'circle', 'dot'))
    }));
    c.hits = spine.map((_, i) => make(g, 'circle', 'hit', { r: (i === 0 ? 20 : 14) * z }));
    c.visible = false;

    // How many bell pairs and units it has grown so far (budding).
    const pairsNow = () => Math.min(nect, (o.startPairs || 1) + Math.floor(c.eaten / 3));
    const unitsNow = () => Math.min(units.length, (o.startUnits || 1) + Math.floor(c.eaten / 2));
    const unitAt = (j) => nect + 1 + j * (o.every || 3);   // stem point a unit hangs from
    const tang = (i) => {
      const a = spine[Math.max(0, i - 1)], b = spine[Math.min(count - 1, i + 1)];
      return Math.atan2(a.y - b.y, a.x - b.x);            // pointing toward the head
    };
    const at = (p, a, fx, sy) => ({ x: p.x + Math.cos(a) * fx - Math.sin(a) * sy, y: p.y + Math.sin(a) * fx + Math.cos(a) * sy });
    // A closed loop: an ellipse of half-length L and half-width W at p, facing a.
    function loop(p, a, L, W, n, squeeze) {
      const P = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n * Math.PI * 2;
        const q = at(p, a, Math.cos(u) * L, Math.sin(u) * W * (1 - squeeze * (0.5 + 0.5 * Math.cos(u))));
        P.push(q.x, q.y);
      }
      return P;
    }
    // A tentacle hanging from p: back along the body, swaying, with a pull to one side.
    function tentacle(p, a, len, side, t, j, steps) {
      return tendrilPts(p.x, p.y, a + Math.PI + side * 0.5, len, (v) => Math.sin(t * 1.8 - v * 6 + j) * 1.4 - side * 0.6 * v, steps || 10);
    }

    function straighten() {
      const bx = -Math.cos(c.heading), by = -Math.sin(c.heading);
      spine.forEach((p, i) => { p.x = c.B.x + bx * o.seg * k() * i; p.y = c.B.y + by * o.seg * k() * i; });
    }

    c.step = (now, e) => {
      S = e.scale;
      c.now = now;
      if (grow < 1) grow = Math.min(1, grow + 0.012);
      // Swimming in pushes: the bells squeeze (pulse 1), then open again.
      phase += c.alive ? (polyp ? 0.035 : 0.06) : 0.02;
      pulse = Math.pow(Math.max(0, Math.sin(phase)), 2);
      c.surge = polyp ? 0.7 : 0.35 + 1.6 * pulse;
      steer(c, now, e);
      spine[0].x = c.B.x; spine[0].y = c.B.y;
      follow(spine, count, o.seg * k());
      // A little stiffness, so the stem smooths out instead of staying kinked.
      for (let i = 2; i < count; i++) {
        const a = spine[i - 2], b = spine[i - 1], p = spine[i];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        p.x += (b.x + dx / d * o.seg * k() - p.x) * 0.06;
        p.y += (b.y + dy / d * o.seg * k() - p.y) * 0.06;
      }
      // Fishing: a tentacle tip that drifts over a word snags it.
      if (c.alive && !c.held) {
        const t = now / 1000;
        const tips = [];
        if (colony) units.slice(0, unitsNow()).forEach((u, j) => { const i = unitAt(j); if (i < count) tips.push([u, tentacle(spine[i], tang(i), o.tent * k(), j % 2 ? 1 : -1, t, j, 8)]); });
        if (bell) arms.forEach((a, j) => tips.push([a, tentacle(spine[0], c.heading, o.tent * k(), j < 2 ? -1 : 1, t, j, 12)]));
        // (one word at a time for the whole colony, then a pause to digest)
        for (const [, P] of tips) {
          if (now < c.nextBite) break;
          const w = words.under(P[P.length - 2], P[P.length - 1], 4 * S);
          if (w) { eat(c, w); c.nextBite = now + o.snagGap; }
        }
        // The polyp eats with its mouth, in the middle of its arms.
        if (polyp && now > c.nextBite) {
          const w = words.under(c.B.x, c.B.y, 6 * S * z);
          if (w) { eat(c, w); c.nextBite = now + 900; }
        }
      }
      advanceBulges(c, 0.015);
    };

    c.draw = () => {
      if (!paint(c)) return;
      const t = c.now / 1000, K = k();
      const a0 = tang(0);
      setPoly(stem, spine.slice(polyp ? 0 : 1, count).flatMap((p) => [p.x, p.y]));
      setDot(headDot, spine[0].x, spine[0].y, (polyp ? 2.4 : 2) * K + bulgeAt(c, 0.05) * 3);
      spine.forEach((p, i) => { show(c.hits[i], i < count); setDot(c.hits[i], p.x, p.y); });

      if (polyp) {
        show(head, false);
        // Arms: a crown round the mouth, reaching forward and waving.
        arms.forEach((arm, j) => {
          const spread = (j / (arms.length - 1) - 0.5) * 2.4;
          const P = tendrilPts(spine[0].x, spine[0].y, a0 + spread, o.armLen * K * (1 + 0.15 * Math.sin(t * 1.3 + j)),
            (v) => Math.sin(t * 2 - v * 5 + j * 1.7) * 1.8 * (c.alive ? 1 : 0.3), 9);
          setPoly(arm.line, P);
          setDot(arm.tip, P[P.length - 2], P[P.length - 1], 1.4 * S);
        });
        // Foot: a small disc at the end of the stalk.
        const end = spine[count - 1], fa = tang(count - 1);
        setPoly(foot, [at(end, fa, 0, -5 * K), at(end, fa, -3 * K, 0), at(end, fa, 0, 5 * K)].flatMap((q) => [q.x, q.y]));
        // Bud: a small polyp growing out of the side, bigger with every word.
        const grown = Math.min(1, c.eaten / (o.budAt || 10));
        const mid = spine[Math.floor(count / 2)], ma = tang(Math.floor(count / 2));
        const tip = at(mid, ma - 1.1, 16 * K * (0.3 + grown), 0);
        [bud.stalk, bud.a, bud.b].forEach((el) => show(el, grown > 0.05));
        setPoly(bud.stalk, [mid.x, mid.y, tip.x, tip.y]);
        const ba = Math.atan2(tip.y - mid.y, tip.x - mid.x);
        setPoly(bud.a, tendrilPts(tip.x, tip.y, ba - 0.6, 8 * K * grown, (v) => Math.sin(t * 2 + v) * 0.8, 4));
        setPoly(bud.b, tendrilPts(tip.x, tip.y, ba + 0.6, 8 * K * grown, (v) => -Math.sin(t * 2 + v) * 0.8, 4));
        return;
      }

      // The float (or Sarsia's bell) in front, squeezing with every push.
      const sq = pulse * (bell ? 0.35 : 0.15);
      const hc = at(spine[0], a0, (bell ? o.bellL * 0.6 : o.float * 0.7) * K, 0);
      setPoly(head, bell ? loop(hc, a0, o.bellL * K, o.bellW * K, 22, sq) : loop(hc, a0, o.float * K, o.float * 0.42 * K, 14, sq));
      if (bell) {
        // The coiled tube inside the bell, wriggling.
        const P = [];
        for (let i = 0; i <= 14; i++) {
          const u = i / 14;
          const q = at(hc, a0, (0.85 - 1.7 * u) * o.bellL * K, Math.sin(u * Math.PI * 3 + t * 2) * o.bellW * 0.45 * K * (1 - sq));
          P.push(q.x, q.y);
        }
        setPoly(tube, P);
        // Four long wavy tentacles from the rim.
        arms.forEach((arm, j) => {
          const side = j < 2 ? -1 : 1;
          const rim = at(hc, a0, -o.bellL * 0.75 * K, side * o.bellW * (j % 2 ? 0.5 : 0.9) * K * (1 - sq));
          const P2 = tendrilPts(rim.x, rim.y, a0 + Math.PI + side * 0.35, o.tent * K, (v) => Math.sin(t * 1.6 - v * 7 + j * 2) * 2.2 - side * 0.4, 16);
          setPoly(arm.line, P2);
          setDot(arm.tip, P2[P2.length - 2], P2[P2.length - 1], 1.3 * S);
        });
      }

      // Swimming bells in pairs behind the float, numbered 1, 2, 3...
      const pn = pairsNow();
      bells.forEach((b, i) => {
        const pair = i >> 1, side = i % 2 ? 1 : -1;
        const on = pair < pn && !b.lost && pair + 1 < count;
        show(b.box, on); show(b.num, on);
        if (!on) return;
        const p = spine[pair + 1], a = tang(pair + 1);
        const s = (1 - 0.18 * pulse) * K;
        const cx = at(p, a, -2 * s, side * 10 * s);
        const shape = [[-7, -5], [6, -6], [8, 0], [6, 6], [-7, 5], [-9, 0], [-7, -5]];
        setPoly(b.box, shape.flatMap(([x, y]) => { const q = at(cx, a, x * s, y * s * side); return [q.x, q.y]; }));
        glyphAt(b.num, cx.x, cx.y, 7 * K, a + Math.PI / 2);
      });

      // The units along the stem (colony), or tiny bells on Sarsia's stem.
      const un = unitsNow();
      units.forEach((u, j) => {
        const i = colony ? unitAt(j) : 2 + j * (o.every || 2);
        const on = j < un && i < count;
        [u.bract, u.zooid, u.tent].concat(u.beads).forEach((el) => show(el, on && (colony || el === u.zooid)));
        if (!on) return;
        const p = spine[i], a = tang(i), side = j % 2 ? 1 : -1;
        if (!colony) {
          // A tiny budding bell clinging to the stem.
          setPoly(u.zooid, loop(at(p, a, 0, side * 4 * K), a, 3.5 * K, 2.5 * K, 8, pulse * 0.2));
          return;
        }
        const leaf = [at(p, a, 0, 0), at(p, a, -4 * K, side * 7 * K), at(p, a, -10 * K, side * 8 * K)];
        setPoly(u.bract, leaf.flatMap((q) => [q.x, q.y]));
        const z1 = at(p, a, -2 * K, -side * 3 * K), z2 = at(p, a, -9 * K, -side * 8 * K);
        setPoly(u.zooid, [z1.x, z1.y, z2.x, z2.y]);
        const P = tentacle(z2, a, o.tent * K, -side, t, j, 10);
        setPoly(u.tent, P);
        // Beads (the stinging cells) along the tentacle.
        u.beads.forEach((el, n) => {
          const q = Math.min(P.length / 2 - 1, 3 + n * 2) * 2;
          setDot(el, P[q], P[q + 1], (n === 3 ? 1.6 : 1.1) * S);
        });
      });
    };

    c.emerge = (x, y, heading) => {
      c.B.x = x; c.B.y = y;
      c.V.x = c.V.y = 0;
      c.heading = c.wanderA = heading;
      grow = 0.2;
      count = o.len;
      bells.forEach((b) => { b.lost = false; });
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
    };
    c.gatherAt = (x, y) => c.teleport(x - c.B.x, y - c.B.y);

    // A bite knocks off the nearest bell, or cuts the stem there.
    c.hurt = (now, p) => {
      c.hurtUntil = now + 900;
      p = p || spine[count - 1];
      let best = null, bd = Infinity;
      bells.forEach((b) => {
        if (b.lost || b.box.getAttribute('visibility') === 'hidden') return;
        const v = (b.box.getAttribute('points') || '').trim().split(/\s+/).map(Number);
        if (v.length < 2) return;
        const d = Math.hypot(v[0] - p.x, v[1] - p.y);
        if (d < bd) { bd = d; best = b; }
      });
      let j = count - 1, sd = Infinity;
      for (let i = 2; i < count; i++) {
        const d = dist(p, spine[i]);
        if (d < sd) { sd = d; j = i; }
      }
      if (best && bd < sd) {
        best.lost = true;
        const v = best.box.getAttribute('points').trim().split(/\s+/).map(Number), pts = [];
        for (let q = 0; q + 1 < v.length; q += 2) pts.push({ x: v[q], y: v[q + 1] });
        spawnDebris(pts, c.B, now, 2.5);
        spawnLetter(best.num.textContent, +best.num.getAttribute('x'), +best.num.getAttribute('y'), null, now, DEBRIS_MS, c.B);
        return;
      }
      // Everything behind the cut drifts off: each unit is its own small
      // animal, so the pieces keep their shape for a moment.
      spawnDebris(spine.slice(j, count), c.B, now, 2.5);
      units.forEach((u, n) => {
        const i = colony ? unitAt(n) : 2 + n * (o.every || 2);
        if (i < j || i >= count || u.tent.getAttribute('visibility') === 'hidden') return;
        const v = (u.tent.getAttribute('points') || '').trim().split(/\s+/).map(Number), pts = [];
        for (let q = 0; q + 1 < v.length; q += 2) pts.push({ x: v[q], y: v[q + 1] });
        spawnDebris(pts, c.B, now, 2, DEBRIS_MS * 1.4);
      });
      count = j;
      if (count < 3) c.dead = true;
    };

    c.parts = () => spine.slice(1, count);
    c.body = () => spine.slice(0, count);
    c.wake = () => { c.alive = true; c.nextMood = 0; c.nextStalk = 0; c.dest = c.spot = null; };
    c.sleep = () => { c.alive = false; c.stalkUntil = c.clingUntil = 0; c.foe = null; c.dest = c.spot = null; };
    c.reset = () => {
      count = o.len;
      bells.forEach((b) => { b.lost = false; });
      Object.assign(c, { eaten: 0, bulges: [], dead: false, throwV: null, clingUntil: 0 });
    };
    c.settled = () => !c.bulges.length && grow === 1 && c.now >= c.hurtUntil &&
      Math.hypot(c.B.x - c.home.x, c.B.y - c.home.y) < 0.3 && Math.hypot(c.V.x, c.V.y) < 0.05;
    c.label = () => (polyp ? arms.length + ' ARMS' : bell ? 'BELL / ' + count + ' STEM' : bells.filter((b, i) => (i >> 1) < pairsNow() && !b.lost).length + ' BELLS / ' + Math.min(unitsNow(), units.filter((_, j) => unitAt(j) < count).length) + ' UNITS');
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
    let gone = false, rebirthAt = 0, hatching = false, token = 0, left = false;
    const c = {
      hits: forms.flatMap((f) => f.hits).concat(pupa.hits),
      mutant: !!opts.mutant, kind: opts.kind || null, line: opts.line || null, removed: false,
      fond: 0, fondOn: false, nextGift: 0, leaving: null
    };
    forms.concat(pupa).forEach((f) => { f.owner = c; });
    for (const key of ['name', 'B', 'V', 'immune']) {
      Object.defineProperty(c, key, { get: () => form[key] });
    }
    Object.defineProperty(c, 'alive', { get: () => !gone && form.alive });
    Object.defineProperty(c, 'mood', { get: () => (gone ? (hatching ? 'HATCHING' : left ? 'LEFT THE PAGE' : 'DEAD') : form.mood) });
    Object.defineProperty(c, 'left', { get: () => gone && left });
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

    // opts.bud: no pupa. The next form buds straight out of this one.
    function budNext(now) {
      const cur = forms[stage];
      dropCarry(cur);
      const x = cur.B.x, y = cur.B.y, h = cur.heading;
      shatter(cur, now); // the old shape falls away as food
      cur.sleep();
      cur.visible = false;
      stage++;
      forms[stage].emerge(x, y, h);
      form = forms[stage];
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
      left = false;
      if (c.mutant) c.removed = true;
      else rebirthAt = now + 9000 + Math.random() * 8000;
    }

    // Gone to another page (through a link): no pieces, it just isn't here
    // any more. A nest creature hatches again later, as after a death.
    c.leave = (now) => {
      if (gone) return;
      hideAll();
      forms.forEach((f) => f.reset());
      stage = 0;
      form = young;
      gone = true;
      hatching = false;
      left = true;
      c.leaving = null;
      c.fond = 0;
      c.fondOn = false;
      if (c.mutant) c.removed = true;
      else rebirthAt = now + 9000 + Math.random() * 8000;
      kick();
    };

    // What travels with it: { line, kind, stage (1-5), eaten, fond }.
    // A pupa travels as the form it was about to become.
    c.pack = () => ({
      line: c.line, kind: c.kind,
      stage: Math.min(forms.length, stage + (form === pupa ? 2 : 1)),
      eaten: form === pupa ? 0 : form.eaten,
      fond: Math.round(c.fond * 100) / 100
    });

    // Arrive from another page at (x, y), as what pack() said it was.
    c.arrive = (x, y, t) => {
      hideAll();
      gone = false;
      hatching = false;
      left = false;
      stage = clamp((t.stage | 0) - 1, 0, forms.length - 1);
      form = forms[stage];
      form.emerge(x, y, Math.random() * Math.PI * 2);
      const st = stages[stage], at = st.evolveAt || st.splitAt || 0;
      form.eaten = clamp(t.eaten | 0, 0, Math.max(0, at - 1)); // not straight into a pupa
      c.fond = clamp(+t.fond || 0, 0, 1);
      c.fondOn = c.fond > 0.6;
      c.nextGift = performance.now() + 4000;
    };

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
      left = false;
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
      if (c.leaving) {
        ERO.travel.send(c, c.leaving);
        if (c.leaving) c.leaving = null; // could not go (same page): stays here
        return;
      }
      const st = stages[stage];
      if (form.dead) {
        die(now);
      } else if (form === pupa) {
        if (pupa.done(now)) hatch();
      } else if (form.alive && st.evolveAt && form.eaten >= st.evolveAt) {
        if (opts.bud) budNext(now);
        else toPupa(now);
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
      if (opts.bud) budNext(performance.now());
      else toPupa(performance.now());
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
        (st.evolveAt ? left(st.evolveAt) + (opts.bud ? ' TO BUD' : ' TO PUPA') : st.splitAt ? left(st.splitAt) + ' TO SPLIT' : form.eaten + ' EATEN');
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
      left = false;
      c.leaving = null;
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
    maxPairs: 3,             // never more than 6 legs (owner: 4 to 6)
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
    // Two pincer arms (slots 0, 1) and six legs.
    slots: [[1, 2, 14], [1, 2, 36], [3, 4, 80], [5, 6, 108], [9, 10, 140]],
    claws: [0, 1],
    growOrder: [0, 1, 2, 3, 4],
    startPairs: 5,
    maxPairs: 5,
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
    slots: [[1, 2, 50], [3, 4, 90], [5, 6, 130]], // six legs (owner: 4 to 6)
    growOrder: [0, 1, 2],
    startPairs: 3,
    maxPairs: 3,
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
    slots: [[1, 2, 40], [3, 4, 90], [5, 6, 140]],
    growOrder: [0, 1, 2],
    startPairs: 3,
    maxPairs: 3,
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
    slots: [[1, 2, 40], [3, 4, 92], [5, 6, 144]],
    growOrder: [0, 1, 2],
    startPairs: 3,
    maxPairs: 3,
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
    slots: [[1, 2, 44], [3, 4, 92], [5, 6, 142]],
    growOrder: [0, 1, 2],
    startPairs: 3,
    maxPairs: 3,
    reach: 96,
    web: 10,
    tails: [{ from: 10, count: 20, seg: 10, silk: true }],
    tune: { cruise: 2, flee: 7, fleeRadius: 130, turn: 0.2, pauseChance: 0.18, roam: 1.4, fightRange: 360, aggression: 0.5 }
  });

  // Strider stage 5: huge, on six legs written in bracket characters.
  const CATHEDRAL = Object.assign({}, COLOSSUS, {
    name: 'CATHEDRAL',
    size: 2.6,
    slots: [[1, 2, 44], [3, 4, 96], [5, 6, 148]],
    growOrder: [0, 1, 2],
    startPairs: 3,
    maxPairs: 3,
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

  // Glyph crawlers ("mutants" in the code): crawl out of a splitting fifth
  // form or hatch out of a word. Each kind has five stages of its own
  // (demo 10, made up as stand-ins until there are real designs):
  //   RIBS  -> CHOIR    -> LANTERN -> RELIQUARY -> OSSUARY
  //   BRACE -> ASTERISK -> TANGLE  -> MEDUSA    -> CHANDELIER
  //   QUILL -> PLUME    -> FROND   -> SERAPH    -> PALIMPSEST
  const MUTANTS = { ribs: 'RIBS', brace: 'BRACE', quill: 'QUILL' };
  const MUTANT_STAGES = {
    ribs: [
      { name: 'RIBS' },
      { name: 'CHOIR', pairs: 2 },                                       // a second, inner rib pair curling the other way
      { name: 'LANTERN', pairs: 2, eyes: true, tail: true, glyphs: [['(', ')']] },
      { name: 'RELIQUARY', pairs: 2, eyes: true, tail: true, crown: '^*^', glyphs: [['{', '}'], ['[', ']']] },
      { name: 'OSSUARY', pairs: 3, eyes: true, tail: true, crown: '<^*^>' }
    ],
    brace: [
      { name: 'BRACE' },
      { name: 'ASTERISK', armText: '*·*·+' },                             // arms of stars
      { name: 'TANGLE', armText: '{}()', curl: 2.6, beads: true },        // writhing, beaded arms
      { name: 'MEDUSA', armText: '()(){}', curl: 2, beads: true, crown: '°·°·°·', crownMode: 'ring' },
      { name: 'CHANDELIER', armText: '[]<>[]', rings: 2, beads: true, crown: '*+*+*+*+', crownMode: 'ring' }
    ],
    quill: [
      { name: 'QUILL', swish: 62 },                                     // a small swaying tail
      { name: 'PLUME', barbs: 3, swish: 70 },                            // three barbs a side, the same tail
      { name: 'FROND', branch: true },                                   // every barb forks
      { name: 'SERAPH', barbs: 3, branch: true, wings: true },           // two long feathers at the shoulders
      { name: 'PALIMPSEST', barbs: 3, branch: true, wings: true, tipText: 'ERODEWRITEOVER', crown: '·:·' }
    ]
  };
  function mutantForm(kind, L) {
    return Object.assign({
      kind,
      size: 0.5 + L * 0.13,
      bones: kind === 'quill' ? 4 + Math.round(L * 1.5) : kind === 'brace' ? 2 + L * 2 : 3 + L, // vertebrae (or arms)
      seg: kind === 'ribs' ? 20 : 14,
      armLen: 7 + L * 2, tseg: 8,
      biteGap: 800 - L * 60,
      tune: {
        cruise: 1.6 + L * 0.1, flee: 7, fleeRadius: 180, turn: 0.25, pauseChance: 0.1, roam: 1.4,
        fightRange: 200 + L * 25, aggression: 0.15 + L * 0.07,
        wiggle: kind === 'brace' ? 0 : 0.3, wavelength: 160
      }
    }, MUTANT_STAGES[kind][L - 1]);
  }
  ERO.mutantKinds = Object.keys(MUTANTS);
  ERO.makeMutant = (svg, kind) => {
    kind = kind || ERO.mutantKinds[Math.floor(Math.random() * ERO.mutantKinds.length)];
    return makeLifeCycle(svg, [1, 2, 3, 4, 5].map((L) => ({
      form: makeGlyph(svg, mutantForm(kind, L)),
      evolveAt: L < 5 ? 8 + L * 3 : 0,
      splitAt: L === 5 ? 26 : 0
    })), { mutant: true, kind, line: 'mutant' });
  };

  ERO.makeCrawler = (svg, opts) => makeLifeCycle(svg, [
    { form: makeSpider(svg, CRAWLER), evolveAt: 20 },
    { form: makeSpider(svg, SCORPION), evolveAt: 30 },
    { form: makeSpider(svg, EMPEROR), evolveAt: 36 },
    { form: makeSpider(svg, WARLORD), evolveAt: 40 },
    { form: makeSpider(svg, THRONE), splitAt: 45 }
  ], Object.assign({ line: 'crawler' }, opts)); // opts.mutant: no nest, gone for good when it dies
  ERO.makeStrider = (svg, opts) => makeLifeCycle(svg, [
    { form: makeSpider(svg, STRIDER), evolveAt: 16 },
    { form: makeSpider(svg, COLOSSUS), evolveAt: 26 },
    { form: makeSpider(svg, BROODMOTHER), evolveAt: 32 },
    { form: makeSpider(svg, WEAVER), evolveAt: 38 },
    { form: makeSpider(svg, CATHEDRAL), splitAt: 44 }
  ], Object.assign({ line: 'strider' }, opts)); // opts.mutant: no nest, gone for good when it dies
  ERO.makeSnake = (svg, opts) => makeLifeCycle(svg, [
    { form: makeSnake(svg, SNAKE), evolveAt: 20 },
    { form: makeSquid(svg, SQUID), evolveAt: 30 },
    { form: makeElder(svg, ELDER), evolveAt: 36 },
    { form: makeElder(svg, LEVIATHAN), evolveAt: 40 },
    { form: makeGlyph(svg, ABYSS), splitAt: 45 }
  ], Object.assign({ line: 'snake' }, opts)); // opts.mutant: no nest, gone for good when it dies

  // ---- Feeding (demo 13) ---------------------------------------------------
  // Hold a word for a moment and it comes out of the text and sticks to your
  // cursor. Let go on top of a creature and it eats from your hand (and grows
  // fonder of you); let go anywhere else and the word lies there as food
  // until something comes for it.
  const HOLD_MS = 380;
  ERO.handFeed = (text, p, now) => {
    let best = null, bd = 46;
    for (const c of ERO.all || []) {
      if (!c.alive || c.gone) continue;
      const f = c.form || c;
      for (const q of [f.mouth ? f.mouth() : f.B].concat(f.parts ? f.parts() : [])) {
        const d = dist(p, q);
        if (d < bd) { bd = d; best = c; }
      }
    }
    if (best) {
      const f = best.form || best;
      eatFlesh(f);
      best.fond = Math.min(1, (best.fond || 0) + 0.3);
      say(f, now);
      kick();
      return best;
    }
    spawnFood(text, p.x, p.y, now);
    kick();
    return null;
  };
  // world: #world; env: the runner's env (pointer in world pixels).
  ERO.feeding = (world, env) => {
    let hold = null, lifted = null;
    world.addEventListener('pointerdown', (e) => {
      const el = e.target.closest && e.target.closest('.ero-w');
      if (!el || e.button !== 0 || el.classList.contains('ero-egg') || el.closest('a, button, label, input, textarea, [data-no-feed]')) return;
      const w = words.list.find((x) => x.el === el);
      if (!w || w.gone) return;
      hold = { w, x: e.clientX, y: e.clientY, timer: setTimeout(() => lift(w), HOLD_MS) };
    });
    function lift(w) {
      hold = null;
      if (w.gone) return;
      words.swallow(w); // it leaves a scar where it was
      const el = make(layer(), 'text', 'ero-carried ero-held');
      el.textContent = w.text;
      lifted = { w, el };
      document.documentElement.classList.add('ero-feeding');
      try { window.getSelection().removeAllRanges(); } catch (_) { /* nothing selected */ }
      place();
      kick();
    }
    function place() {
      if (!lifted) return;
      lifted.el.setAttribute('x', (env.ptr.x + 8).toFixed(1));
      lifted.el.setAttribute('y', (env.ptr.y - 8).toFixed(1));
    }
    window.addEventListener('pointermove', (e) => {
      if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) { clearTimeout(hold.timer); hold = null; }
      if (lifted) { e.preventDefault(); requestAnimationFrame(place); }
    });
    const drop = () => {
      if (hold) { clearTimeout(hold.timer); hold = null; }
      if (!lifted) return;
      const { w, el } = lifted;
      lifted = null;
      el.remove();
      document.documentElement.classList.remove('ero-feeding');
      ERO.handFeed(w.text, { x: env.ptr.x, y: env.ptr.y }, performance.now());
    };
    window.addEventListener('pointerup', drop);
    window.addEventListener('pointercancel', drop);
    world.addEventListener('contextmenu', (e) => { if (lifted || hold) e.preventDefault(); });
  };

  // Siphon line (demo 13): hydra polyp -> Sarsia bell -> growing colonies.
  const SIPHON_TUNE = { cruise: 1.5, flee: 6.5, fleeRadius: 170, turn: 0.2, pauseChance: 0.06, roam: 1.3, fightRange: 220, aggression: 0.2, wiggle: 0.12, wavelength: 240 };
  const POLYP = { name: 'POLYP', mode: 'polyp', size: 1.3, len: 7, seg: 8, arms: 6, armLen: 26, budAt: 12, tune: Object.assign({}, SIPHON_TUNE, { cruise: 0.9, wiggle: 0 }) };
  const SARSIA = { name: 'BELL', mode: 'bell', size: 1.35, len: 16, seg: 7, bellL: 16, bellW: 12, tent: 95, units: 6, every: 2, snagGap: 2600, tune: SIPHON_TUNE };
  const CHAIN = { name: 'CHAIN', mode: 'colony', size: 1.4, len: 14, seg: 9, float: 8, pairs: 2, startPairs: 1, units: 3, startUnits: 1, every: 3, tent: 42, snagGap: 2800, tune: SIPHON_TUNE };
  const COLONY = Object.assign({}, CHAIN, { name: 'COLONY', size: 1.5, len: 24, pairs: 5, startPairs: 2, units: 6, startUnits: 2, tent: 56, snagGap: 2400 });
  const ARMADA = Object.assign({}, CHAIN, { name: 'ARMADA', size: 1.6, len: 34, pairs: 7, startPairs: 4, units: 9, startUnits: 4, tent: 70, snagGap: 2000,
    tune: Object.assign({}, SIPHON_TUNE, { cruise: 1.3, fightRange: 300, aggression: 0.35 }) });
  ERO.makeSiphon = (svg, opts) => makeLifeCycle(svg, [
    { form: makeSiphon(svg, POLYP), evolveAt: 12 },
    { form: makeSiphon(svg, SARSIA), evolveAt: 18 },
    { form: makeSiphon(svg, CHAIN), evolveAt: 22 },
    { form: makeSiphon(svg, COLONY), evolveAt: 28 },
    { form: makeSiphon(svg, ARMADA), splitAt: 34 }
  ], Object.assign({ line: 'siphon', bud: true }, opts)); // buds instead of pupating; splits into polyps

  // Every line and the names of its five stages, for summoning (the Archive).
  // line + kind are what ERO.travel.make() takes.
  ERO.catalog = [
    { line: 'crawler', kind: null, names: [CRAWLER, SCORPION, EMPEROR, WARLORD, THRONE].map((f) => f.name) },
    { line: 'strider', kind: null, names: [STRIDER, COLOSSUS, BROODMOTHER, WEAVER, CATHEDRAL].map((f) => f.name) },
    { line: 'snake', kind: null, names: ['SNAKE', 'SQUID', ELDER.name, LEVIATHAN.name, ABYSS.name] },
    { line: 'siphon', kind: null, names: [POLYP, SARSIA, CHAIN, COLONY, ARMADA].map((f) => f.name) }
  ].concat(Object.keys(MUTANT_STAGES).map((kind) => ({ line: 'mutant', kind, names: MUTANT_STAGES[kind].map((f) => f.name) })));

  // ---- Travel between pages ------------------------------------------------
  // Travellers wait in sessionStorage (this tab only) under the address of
  // the page they went to, at most TRAVEL_MAX of them. Pages are compared by
  // path, with "index.html" left off. If storage is blocked, nobody travels.
  const TRAVEL_KEY = 'ero-travellers';
  const TRAVEL_MAX = 12;
  const MAKERS = { crawler: ERO.makeCrawler, strider: ERO.makeStrider, snake: ERO.makeSnake, siphon: ERO.makeSiphon };
  function path(href) {
    try {
      const u = new URL(href, location.href);
      return u.origin === location.origin ? u.pathname.replace(/index\.html$/, '') : null;
    } catch (_) { return null; }
  }
  function readTrips() {
    try { return JSON.parse(sessionStorage.getItem(TRAVEL_KEY)) || []; } catch (_) { return []; }
  }
  function writeTrips(list) {
    try { sessionStorage.setItem(TRAVEL_KEY, JSON.stringify(list.slice(-TRAVEL_MAX))); } catch (_) { /* blocked */ }
  }
  const here = path(location.href);
  let storageOk = false;
  try { sessionStorage.setItem(TRAVEL_KEY + '-ok', '1'); storageOk = true; } catch (_) { /* blocked */ }

  ERO.travel = {
    on: storageOk,
    path,
    // Creature c goes to href: remembered there, and gone from this page.
    send(c, href) {
      const to = path(href);
      if (!storageOk || !to || to === here || c.gone) return false;
      const trips = readTrips();
      trips.push(Object.assign(c.pack(), { to, from: here }));
      writeTrips(trips);
      c.leave(performance.now());
      return true;
    },
    // Everyone waiting for this page (they are taken off the list).
    arrivals() {
      const trips = readTrips();
      const mine = trips.filter((t) => t.to === here);
      if (mine.length) writeTrips(trips.filter((t) => t.to !== here));
      return mine;
    },
    // A new creature for traveller t (a wild one: it has no nest here).
    make(svg, t) {
      if (t.line === 'mutant') return ERO.makeMutant(svg, ERO.mutantKinds.includes(t.kind) ? t.kind : null);
      return MAKERS[t.line] ? MAKERS[t.line](svg, { mutant: true }) : null;
    },
    // A visitor clicked a link: every awake creature that is fond of them follows.
    follow(all, href) {
      let n = 0;
      for (const c of all) if (c.alive && c.fondOn && ERO.travel.send(c, href)) n++;
      return n;
    },
    clear() {
      try { sessionStorage.removeItem(TRAVEL_KEY); } catch (_) { /* blocked */ }
    }
  };
})();
