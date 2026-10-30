/* Erosion.exe: Unspecified game, first test (phase 01, isometric).
   A world made only of characters. You are the red block (a cursor that got
   loose). Move with arrows / WASD, or tap a spot to walk there.
   The look is C, density: the world is drawn as shapes, then turned into
   characters (Marcus' pick, 30 Oct 2026). The two test looks it was chosen
   from are kept for comparison on the keys 1 and 2 (3 goes back to C):
     A lattice: one shifting glyph per tile, walls as stacked glyphs
     B oblique: the same world as a flat grid tilted forward
   The world is new on every visit. Some presences are dangerous, you can't
   tell which. A crash (or an exit) leaves a trace you find next time.
   Phase 02, the dark: you only see what your light falls on (a beam where
   you face, a circle on touch screens). Text is written on the floor, hidden
   relics can be collected (kept in this browser, for the Index to show
   later), and agents that freeze in the light take pieces of you. */
(() => {
  'use strict';

  const canvas = document.getElementById('ug-canvas');
  const ctx = canvas.getContext('2d');
  const msgEl = document.getElementById('ug-msg');
  const statusEl = document.getElementById('ug-status');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const FONT = 'Consolas, "Courier New", ui-monospace, monospace';
  const INK = '232,230,223';
  const RED = '#e8441b';
  const BG = '#060606';
  const SIGHT = 13;                  // roughly how far you see, in tiles (the real edge follows the screen)
  const STEP_MS = 115;               // one tile of walking

  // ---- Random numbers: the same seed always gives the same world ----------
  let seed = (Math.random() * 0xffffffff) >>> 0;
  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function noise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

  // ---- Words (placeholders, to be rewritten) --------------------------------
  const OBJECT_GLYPHS = ['¤', 'ø', '§', '∂', '¶', '¿'];
  const OBJECT_LINES = [
    'A KEY WITH NO TEETH. IT STILL TURNS.',
    'SOMEONE COUNTED THE FLOOR HERE. THE NUMBER IS WRONG.',
    'A SMALL WARM FILE. DO NOT OPEN.',
    'THIS WAS A WINDOW ONCE.',
    'A TOOTH MADE OF PIXELS.',
    'THE SYMBOLS HERE ARE NEWER THAN THE OTHERS.',
    'NOTHING. BUT IT IS ARRANGED CAREFULLY.',
    'A NOTE: "DO NOT FOLLOW THE ONES THAT STAND STILL."',
  ];
  const HAND_LINES = [
    'IT IS STILL REACHING.',
    'SIX FINGERS. SOMEONE MISCOUNTED.',
    'IT TURNS TOWARD YOU WHEN YOU ARE NOT LOOKING.',
  ];
  const PASS_LINES = ['IT PASSES THROUGH YOU.', 'IT WAS NOT THERE.', 'IT KNOWS YOUR NAME. IT SAYS IT WRONG.'];
  const INSCRIPTIONS = [ // phase 02 floor text (placeholders)
    'YOU WERE HERE BEFORE THE FLOOR WAS',
    'DO NOT READ THIS PART',
    'THE LIGHT IS NOT YOURS',
    'EVERYTHING HERE WAS DELETED ONCE',
    'THEY ARE SLOWER WHEN SEEN',
    'SOMEONE WROTE THIS WITH THEIR HANDS',
    'NOTHING BELOW',
    'KEEP THE PIECES',
  ];
  const RELICS = window.EROSION_RELICS || [{ id: 'stone', glyph: '⌬', name: 'A WARM STONE' }]; // relics.js
  const HIT_LINES = ['SOMETHING TOOK A PIECE OF YOU.', 'YOU ARE LESS THAN YOU WERE.', 'A PART OF YOU IS SOMEWHERE ELSE NOW.'];
  const FLOOR = ['.', '.', '.', ',', '`', '·', ':', '.', "'", '.'];
  const SCRAMBLE = ['$', 'S', '?', '7', 'j', 'd', '%', '#', '/', '\\', '|', '!'];
  const PRESENCE = ['ж', '¥', '&', '%', 'Ø', '¤', '#'];

  // ---- The hand: drawn once as a shape, then read as characters ----------
  // A tall reaching hand with one finger too many. Used as a landmark.
  const HAND = (() => {
    const W = 100, H = 130;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.lineCap = 'round';
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(38, 130); g.lineTo(42, 92); g.lineTo(70, 94); g.lineTo(70, 130); g.fill(); // wrist
    const fingers = [ // from, to, width (little finger first, so the others overlap it)
      [70, 70, 86, 36, 8], [64, 64, 70, 16, 9], [56, 60, 54, 6, 10],
      [48, 62, 40, 10, 10], [42, 66, 26, 22, 9], [36, 84, 12, 58, 11],
    ];
    for (const [x1, y1, x2, y2, w] of fingers) {
      g.strokeStyle = '#000'; g.lineWidth = w + 3;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = w;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    g.beginPath(); g.ellipse(55, 82, 20, 20, 0, 0, Math.PI * 2); g.fill(); // palm
    // depth (distance to the edge) gives the shading
    const px = g.getImageData(0, 0, W, H).data;
    const inside = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) inside[i] = px[i * 4 + 3] > 100 && px[i * 4] > 128 ? 1 : 0;
    const dist = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) dist[i] = inside[i] ? 99 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!dist[i]) continue;
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (y > 0) dist[i] = Math.min(dist[i], dist[i - W] + 1);
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!dist[i]) continue;
      if (x < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (y < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + 1);
    }
    // shaded sprite for look C
    const shade = document.createElement('canvas');
    shade.width = W; shade.height = H;
    const sg = shade.getContext('2d');
    const img = sg.createImageData(W, H);
    const lum = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!inside[i]) continue;
      const v = (0.35 + 0.65 * Math.min(1, dist[i] / 7)) * (0.7 + 0.3 * (1 - x / W));
      lum[i] = v;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.round(v * 255);
      img.data[i * 4 + 3] = 255;
    }
    sg.putImageData(img, 0, 0);
    // character version for looks A and B (and its mirror)
    const ROWS = 26, COLS = Math.round(ROWS * (W / H) / 0.6);
    const RAMP = ':;!iI?S$$';
    function sample(mirror) {
      const cov = [], val = [];
      for (let r = 0; r < ROWS; r++) {
        cov.push([]); val.push([]);
        for (let q = 0; q < COLS; q++) {
          let n = 0, s = 0, cnt = 0;
          const x0 = Math.floor(q * W / COLS), x1 = Math.floor((q + 1) * W / COLS);
          const y0 = Math.floor(r * H / ROWS), y1 = Math.floor((r + 1) * H / ROWS);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const xx = mirror ? W - 1 - x : x;
            cnt++; if (lum[y * W + xx] > 0) { n++; s += lum[y * W + xx]; }
          }
          cov[r].push(n / cnt); val[r].push(n ? s / n : 0);
        }
      }
      const on = (r, q) => r >= 0 && q >= 0 && r < ROWS && q < COLS && cov[r][q] > 0.3;
      const rows = [];
      for (let r = 0; r < ROWS; r++) {
        let line = '';
        for (let q = 0; q < COLS; q++) {
          if (!on(r, q)) { line += cov[r][q] > 0.08 ? '.' : ' '; continue; }
          const k = (r * 31 + q * 17) % 3;
          if (!on(r, q - 1)) line += 'dj('[k];
          else if (!on(r, q + 1)) line += '?7)'[k];
          else if (!on(r - 1, q)) line += '.,_'[k];
          else line += RAMP[Math.min(RAMP.length - 1, Math.floor(val[r][q] * cov[r][q] * RAMP.length))];
        }
        rows.push(line);
      }
      return rows;
    }
    return { shade, W, H, ROWS, COLS, chars: sample(false), mirrored: sample(true) };
  })();

  // ---- The world ------------------------------------------------------------
  let tiles = new Map();
  let things = new Map();         // "x,y" -> { kind, ... }
  let presences = [];
  let traces = [];
  let letters = new Map();        // phase 02: "x,y" -> { ch, line }
  const key = (x, y) => x + ',' + y;
  // phase 02 floor text runs left to right across the screen
  function layLine(x, y) {
    const line = pick(INSCRIPTIONS, hash(x, y, seed + 40));
    for (let i = 0; i < line.length; i++) {
      const k = key(x + i, y - i);
      if (line[i] !== ' ' && !letters.has(k)) letters.set(k, { ch: line[i], line });
    }
  }

  function tile(x, y) {
    const k = key(x, y);
    let t = tiles.get(k);
    if (t) return t;
    if (tiles.size > 60000) tiles.clear();
    const n = noise(x / 7, y / 7, seed) * 0.7 + noise(x / 2.5, y / 2.5, seed + 7) * 0.3;
    const r = hash(x, y, seed + 11);
    t = { type: 'floor', h: 0, r };
    if (phase === 2) {
      if (Math.abs(x) + Math.abs(y) > 2) {
        if (n > 0.8 || r < 0.004) { t.type = 'wall'; t.h = 2 + Math.floor(hash(x, y, seed + 12) * 3); }
        else {
          const r2 = hash(x, y, seed + 13);
          if (r2 < 0.0035 && !things.has(k)) {
            things.set(k, { kind: 'relic', relic: pick(RELICS, hash(x, y, seed + 15)) });
          } else if (r2 < 0.0075) layLine(x, y);
          else if (r2 > 0.9994 && !things.has(k)) things.set(k, { kind: 'exit' });
        }
      }
      tiles.set(k, t);
      return t;
    }
    if (Math.abs(x) + Math.abs(y) > 2) {
      if (n < 0.24) t.type = 'void';
      else if (n > 0.77 || r < 0.012) {
        t.type = 'wall';
        t.h = Math.min(5, 1 + Math.floor(hash(x, y, seed + 12) * 2 + Math.max(0, n - 0.77) * 16));
      } else {
        const r2 = hash(x, y, seed + 13);
        if (r2 < 0.0022 && !things.has(k)) things.set(k, { kind: 'hand', scale: 0.75 + hash(x, y, seed + 14) * 0.6 });
        else if (r2 < 0.008 && !things.has(k)) things.set(k, { kind: 'object', glyph: pick(OBJECT_GLYPHS, hash(x, y, seed + 15)), line: pick(OBJECT_LINES, hash(x, y, seed + 16)) });
        else if (r2 > 0.9993 && !things.has(k)) things.set(k, { kind: 'exit' });
      }
    }
    tiles.set(k, t);
    return t;
  }
  const solid = (x, y) => {
    const t = tile(x, y);
    if (t.type !== 'floor') return true;
    const th = things.get(key(x, y));
    return !!(th && th.kind === 'hand');
  };

  // a free floor tile somewhere between two distances from the start
  function findFloor(rnd, min, max) {
    for (let i = 0; i < 200; i++) {
      const a = rnd() * Math.PI * 2, d = min + rnd() * (max - min);
      const x = Math.round(Math.cos(a) * d), y = Math.round(Math.sin(a) * d);
      if (!solid(x, y) && !things.has(key(x, y))) return [x, y];
    }
    return null;
  }

  // ---- Traces: you, from earlier runs (this browser only), and visitors the game invents
  const TRACE_KEY = 'ero-ugame-traces';
  function loadTraces() {
    try { return JSON.parse(localStorage.getItem(TRACE_KEY)) || []; } catch (_) { return []; }
  }
  function saveTrace(how) {
    const all = loadTraces();
    all.push({ at: Date.now(), how });
    try { localStorage.setItem(TRACE_KEY, JSON.stringify(all.slice(-24))); } catch (_) { /* storage blocked: no memory */ }
  }
  function ago(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 2) return 'JUST NOW';
    if (m < 60) return m + ' MIN AGO';
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' HOUR AGO' : ' HOURS AGO');
    const d = Math.round(h / 24);
    return d === 1 ? 'YESTERDAY' : d + ' DAYS AGO';
  }

  // ---- Player ---------------------------------------------------------------
  const player = { x: 0, y: 0, fx: 0, fy: 0, t0: 0, moving: false, path: [], hp: 3, dir: [1, 0], carry: [] };
  const facing = { x: 1, y: 0 };  // the beam turns smoothly toward dir
  const cam = { x: 0, y: 0 };
  let phase = new URLSearchParams(location.search).get('phase') === '2' ? 2 : 1; // ?phase=2 jumps into the dark
  let born = 0;                   // when this world appeared: it spreads out from you
  let crash = null;               // { t0, title, sub, next }

  function newWorld() {
    seed = (Math.random() * 0xffffffff) >>> 0;
    tiles = new Map(); things = new Map(); presences = []; traces = []; letters = new Map();
    Object.assign(player, { x: 0, y: 0, fx: 0, fy: 0, moving: false, path: [], hp: 3, carry: [] });
    cam.x = 0; cam.y = 0;
    let s = seed;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) tile(x, y);
    updateHud();
    if (phase === 2) return newDark(rnd);
    // a hand near the start, so it is seen, and one exit a walk away
    const h = findFloor(rnd, 5, 8);
    if (h) things.set(key(h[0], h[1]), { kind: 'hand', scale: 1 });
    const e = findFloor(rnd, 16, 24);
    if (e) things.set(key(e[0], e[1]), { kind: 'exit' });
    // your own traces, the newest first
    loadTraces().slice(-6).reverse().forEach((tr) => {
      const p = findFloor(rnd, 4, 16);
      if (p) things.set(key(p[0], p[1]), { kind: 'trace', own: true, label: 'A TRACE: YOU, ' + ago(tr.at) + '. ' + (tr.how === 'exit' ? 'LEFT.' : 'FAULT.') });
    });
    for (let i = 0; i < 3; i++) {
      const p = findFloor(rnd, 6, 22);
      const id = Math.floor(rnd() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
      if (p) things.set(key(p[0], p[1]), { kind: 'trace', own: false, label: 'A TRACE: VISITOR_' + id + ', ' + pick(['??', 'NEVER', 'TOMORROW', 'BEFORE YOU'], rnd()) + '.' });
    }
    for (let i = 0; i < 6; i++) spawnPresence(rnd);
    born = performance.now();
    updateStatus();
  }

  function newDark(rnd) {
    // one line of floor text right where you wake up, a relic and an exit further out
    layLine(-4, 3);
    const r = findFloor(rnd, 6, 10);
    if (r) things.set(key(r[0], r[1]), { kind: 'relic', relic: pick(RELICS, rnd()) });
    const e = findFloor(rnd, 22, 30);
    if (e) things.set(key(e[0], e[1]), { kind: 'exit' });
    loadTraces().slice(-4).forEach(() => {
      const p = findFloor(rnd, 5, 18);
      if (p) things.set(key(p[0], p[1]), { kind: 'trace', own: true, label: 'A TRACE: YOU. IT IS STILL WARM.' });
    });
    for (let i = 0; i < 5; i++) spawnAgent(rnd);
    say('PHASE 02. SOMETHING IS ALREADY LOOKING.');
    born = performance.now();
    updateStatus();
  }

  // ---- Presences: some flee, some follow, some stand still, some hunt -------
  const KINDS = ['shy', 'follow', 'still', 'hunt'];
  function spawnPresence(rnd = Math.random) {
    const p = findFloorNear(player.x, player.y, rnd, 9, 18);
    if (!p) return;
    presences.push({ x: p[0], y: p[1], fx: p[0], fy: p[1], t0: 0, kind: KINDS[Math.floor(rnd() * KINDS.length)], next: performance.now() + 500 + rnd() * 1500 });
  }
  function spawnAgent(rnd = Math.random) {
    const p = findFloorNear(player.x, player.y, rnd, 11, 18);
    if (p) presences.push({ x: p[0], y: p[1], fx: p[0], fy: p[1], t0: 0, kind: 'agent', next: performance.now() + 1500 + rnd() * 1500 });
  }
  function findFloorNear(cx, cy, rnd, min, max) {
    for (let i = 0; i < 100; i++) {
      const a = rnd() * Math.PI * 2, d = min + rnd() * (max - min);
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (!solid(x, y)) return [x, y];
    }
    return null;
  }
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  function stepToward(e, tx, ty, away) {
    let best = null, bestD = away ? -1 : 1e9;
    for (const [dx, dy] of NB) {
      const nx = e.x + dx, ny = e.y + dy;
      if (solid(nx, ny) || presences.some((o) => o !== e && o.x === nx && o.y === ny)) continue;
      const d = Math.hypot(tx - nx, ty - ny) + Math.random() * 0.3;
      if (away ? d > bestD : d < bestD) { bestD = d; best = [nx, ny]; }
    }
    return best;
  }
  function updatePresences(now) {
    for (let i = presences.length - 1; i >= 0; i--) {
      const e = presences[i];
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d > 26) { presences.splice(i, 1); if (phase === 2) spawnAgent(); else spawnPresence(); continue; }
      if (now < e.next) continue;
      let to = null;
      // agents freeze while your light is on them, and come closer in the dark
      if (e.kind === 'agent') {
        e.lit = light(e.x, e.y) > 0.15;
        const lure = nearestLure(e);
        if (e.lit) to = null;
        else if (lure) to = stepToward(e, lure.x, lure.y);
        else to = d < 16 ? stepToward(e, player.x, player.y) : stepToward(e, e.x + Math.random() * 6 - 3, e.y + Math.random() * 6 - 3);
        if (to && lure && to[0] === lure.x && to[1] === lure.y) {
          things.delete(key(lure.x, lure.y));
          say('SOMETHING TOOK THE ' + lure.relic.glyph + '.');
        }
      } else if (e.kind === 'shy') to = d < 6 ? stepToward(e, player.x, player.y, true) : (Math.random() < 0.4 ? stepToward(e, e.x + Math.random() * 6 - 3, e.y + Math.random() * 6 - 3) : null);
      else if (e.kind === 'follow') to = d > 3 ? stepToward(e, player.x, player.y) : null;
      else if (e.kind === 'hunt') to = d < 7 ? stepToward(e, player.x, player.y) : (Math.random() < 0.3 ? stepToward(e, e.x + Math.random() * 6 - 3, e.y + Math.random() * 6 - 3) : null);
      if (to) { e.fx = e.x; e.fy = e.y; [e.x, e.y] = to; e.t0 = now; }
      e.next = now + (e.kind === 'hunt' ? 420 : e.kind === 'agent' ? 380 : 650) + Math.random() * (e.kind === 'agent' ? 250 : 500);
      touch(e);
    }
  }
  function touch(e) {
    if (crash || e.x !== player.x || e.y !== player.y) return;
    if (e.kind === 'agent') return hit(e);
    if (e.kind === 'hunt') fault();
    else say(pick(PASS_LINES, Math.random()));
  }

  // ---- Crash and exit -------------------------------------------------------
  // from phase 01 both a crash and the exit lead into the dark (02). Phase 03
  // does not exist yet, so the dark sends you back to 01.
  const nextSub = () => (phase === 1 ? 'WAKING IN PHASE 02.' : 'PHASE 03 NOT FOUND. RETURNING TO 01.');
  function fault() {
    sound.crash();
    saveTrace('fault');
    crash = { t0: performance.now(), title: (phase === 2 ? 'DECONSTRUCTED 0x' : 'PROCESS FAULT 0x') + Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0'), sub: nextSub(), next: phase === 1 ? 2 : 1 };
    say('');
  }
  function exitPhase() {
    sound.exit();
    saveTrace('exit');
    crash = { t0: performance.now(), title: 'EXIT ACCEPTED', sub: nextSub(), next: phase === 1 ? 2 : 1 };
    say('');
  }
  function hit(e) {
    player.hp--;
    sound.hit();
    // the agent is gone for now, it comes back from somewhere else
    presences.splice(presences.indexOf(e), 1);
    spawnAgent();
    if (player.hp <= 0) return fault();
    say(pick(HIT_LINES, Math.random()));
    updateStatus();
  }

  // ---- Relics: kept in this browser, so other pages (the Index) can show them
  const RELIC_KEY = 'ero-relics';
  function loadRelics() {
    try { return JSON.parse(localStorage.getItem(RELIC_KEY)) || []; } catch (_) { return []; }
  }
  function saveRelics(all) {
    try { localStorage.setItem(RELIC_KEY, JSON.stringify(all.slice(-60))); } catch (_) { /* storage blocked: kept nowhere */ }
  }
  function collect(th, x, y) {
    things.delete(key(x, y));
    saveRelics(loadRelics().concat({ id: th.relic.id, at: Date.now() }));
    player.carry.push(th.relic);
    sound.relic();
    say('KEPT: ' + th.relic.glyph + '  ' + th.relic.name + '.');
    updateStatus();
  }
  // drop the last relic you picked up here: agents in the dark go for it
  // instead of you. Whatever they reach, they take, and it is gone for good.
  function dropRelic() {
    if (phase !== 2 || crash || !player.carry.length) return;
    const k = key(player.x, player.y);
    if (things.has(k)) return say('THERE IS ALREADY SOMETHING HERE.');
    const relic = player.carry.pop();
    things.set(k, { kind: 'lure', relic, x: player.x, y: player.y });
    const all = loadRelics();
    const i = all.map((r) => r.id).lastIndexOf(relic.id);
    if (i >= 0) all.splice(i, 1);
    saveRelics(all);
    sound.relic();
    say('YOU LEAVE ' + relic.glyph + ' ON THE FLOOR. SOMETHING TURNS TOWARD IT.');
    updateStatus();
  }
  function nearestLure(e) {
    let best = null, bestD = 14;
    things.forEach((th) => {
      if (th.kind !== 'lure') return;
      const d = Math.hypot(th.x - e.x, th.y - e.y);
      if (d < bestD) { bestD = d; best = th; }
    });
    return best;
  }

  // ---- Messages (typed out like the rest of Erosion) -----------------------
  let typing = null, lastMsg = '', fade = null;
  function say(text) {
    if (text === lastMsg) return;
    lastMsg = text;
    clearInterval(typing);
    clearTimeout(fade);
    if (text) fade = setTimeout(() => say(''), 7000);
    if (reduce.matches || !text) { msgEl.textContent = text; return; }
    let i = 0;
    msgEl.textContent = '';
    typing = setInterval(() => {
      msgEl.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(typing);
    }, 28);
  }
  function updateStatus() {
    const own = loadTraces().length;
    let text = 'SEED ' + seed.toString(16).toUpperCase().padStart(8, '0') + ' / ' + own + (own === 1 ? ' TRACE' : ' TRACES');
    if (phase === 2) text += ' / INTEGRITY ' + '█'.repeat(Math.max(0, player.hp)) + '░'.repeat(3 - Math.max(0, player.hp)) + ' / ' + loadRelics().length + ' KEPT';
    statusEl.textContent = text;
    const top = player.carry[player.carry.length - 1];
    dropBtn.hidden = phase !== 2 || !top;
    if (top) dropBtn.textContent = 'DROP ' + top.glyph;
  }
  const dropBtn = document.getElementById('ug-drop');
  dropBtn.addEventListener('click', dropRelic);
  function updateHud() {
    document.querySelector('.ug-here').textContent = 'PHASE 0' + phase;
    document.getElementById('ug-phase').textContent = phase === 2 ? 'DARK' : LOOK_NAMES[look];
  }
  function lookAround() {
    const here = things.get(key(player.x, player.y));
    if (here && here.kind === 'object') return say(here.glyph + '  ' + here.line);
    if (here && here.kind === 'trace') return say(here.label);
    if (here && here.kind === 'exit') return exitPhase();
    if (here && here.kind === 'relic') return collect(here, player.x, player.y);
    // floor text: standing next to it reads the whole line out
    if (phase === 2) {
      for (const [dx, dy] of [[0, 0], ...NB]) {
        const l = letters.get(key(player.x + dx, player.y + dy));
        if (l) return say('"' + l.line + '"');
      }
    }
    for (const [dx, dy] of NB) {
      const th = things.get(key(player.x + dx, player.y + dy));
      if (th && th.kind === 'hand') return say(pick(HAND_LINES, hash(player.x + dx, player.y + dy, seed + 30)));
    }
  }

  // ---- Looks: projection from tiles to the screen ---------------------------
  let look = 'c';
  let W = 0, H = 0, U = 18, DPR = 1;
  function proj(dx, dy, z) {
    if (look === 'b') return [(dx + dy * 0.5) * U * 1.25, dy * U * 0.72 - z * U * 0.8];
    return [(dx - dy) * U, (dx + dy) * U * 0.5 - z * U * 0.9];
  }
  const depth = (x, y) => (look === 'b' ? y + x * 0.001 : x + y + x * 0.001);
  function corners(dx, dy, z, s = 0.5) {
    return [proj(dx - s, dy - s, z), proj(dx + s, dy - s, z), proj(dx + s, dy + s, z), proj(dx - s, dy + s, z)];
  }
  function poly(g, pts, ox, oy) {
    g.beginPath();
    g.moveTo(ox + pts[0][0], oy + pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(ox + pts[i][0], oy + pts[i][1]);
    g.closePath();
    g.fill();
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    U = Math.max(14, Math.min(30, Math.min(W, H * 1.6) / 27));
  }
  window.addEventListener('resize', resize);
  // how far out a tile is: 0 at you, 1 at the edge of sight. The edge is an
  // oval that follows the screen, so phones see further up and down.
  const radii = () => [Math.min(W * 0.46, SIGHT * U * 1.15), Math.min(H * 0.4, SIGHT * U * 0.8)];
  function sight(dx, dy) {
    const [sx, sy] = proj(dx, dy, 0);
    const [rx, ry] = radii();
    return Math.hypot(sx / rx, sy / ry);
  }
  // phase 02: how much light falls on a tile, 0 to 1. A beam where you face,
  // or a circle on touch screens, plus a small glow right around you.
  const coarse = window.matchMedia('(pointer: coarse)');
  const lp = { x: 0, y: 0 };      // where the light comes from (you, between tiles)
  let flicker = 1;
  function light(x, y) {
    const dx = x - lp.x, dy = y - lp.y, d = Math.hypot(dx, dy);
    const glow = Math.max(0, 1 - d / 1.9);
    if (coarse.matches) return Math.max(glow, 1 - Math.pow(d / 5.5, 2)) * flicker;
    if (d < 0.01) return flicker;
    const cos = (dx * facing.x + dy * facing.y) / (d * (Math.hypot(facing.x, facing.y) || 1));
    const cone = Math.min(1, Math.max(0, (cos - 0.72) / 0.16));
    return Math.max(glow, cone * Math.max(0, 1 - Math.pow(d / 12, 1.5))) * flicker;
  }
  // how many tiles out to look, so the whole oval is covered
  const reach = () => { const [rx, ry] = radii(); return Math.ceil((rx + 2 * ry) / U) + 2; };

  // ---- Drawing: everything in view, back to front ---------------------------
  function scene(now) {
    const list = [];
    const k0 = reduce.matches ? 1 : Math.min(1, (now - born) / 1600);
    const reveal = Math.max(0.02, 1 - Math.pow(1 - k0, 3));
    const R = reach() + 6;
    const pk = player.moving ? Math.min(1, (now - player.t0) / STEP_MS) : 1;
    lp.x = player.fx + (player.x - player.fx) * pk; lp.y = player.fy + (player.y - player.fy) * pk;
    const px = Math.round(cam.x), py = Math.round(cam.y);
    for (let y = py - R; y <= py + R; y++) for (let x = px - R; x <= px + R; x++) {
      const d = sight(x - cam.x, y - cam.y) / reveal;
      if (d > 1) continue;
      let fog = Math.max(0, 1 - Math.pow(d, 1.6));
      if (phase === 2) { fog = light(x, y) * reveal; if (fog < 0.03) continue; }
      list.push({ z: depth(x, y), kind: 'tile', x, y, t: tile(x, y), th: things.get(key(x, y)), fog });
    }
    for (const e of presences) {
      const k = Math.min(1, (now - e.t0) / 300);
      const ex = e.fx + (e.x - e.fx) * k, ey = e.fy + (e.y - e.fy) * k;
      const d = sight(ex - cam.x, ey - cam.y) / reveal;
      if (d > 1.45) continue;
      // presences show further out than the floor, faintly
      let fog = d < 1 ? Math.max(0.3, 1 - Math.pow(d, 1.6)) : 0.22 * (1 - (d - 1) / 0.45);
      if (phase === 2) { fog = light(ex, ey); if (fog < 0.1) continue; } // unlit agents are only eyes (see overlay)
      list.push({ z: depth(ex, ey) + 0.01, kind: 'presence', x: ex, y: ey, e, fog });
    }
    list.push({ z: depth(lp.x, lp.y) + 0.02, kind: 'player', x: lp.x, y: lp.y, fog: 1 });
    list.sort((a, b) => a.z - b.z);
    return list;
  }

  // the glyph a floor tile shows right now: each tile shifts at its own pace,
  // and slow waves of scrambled symbols wash over the floor
  function floorGlyph(x, y, t, now) {
    if (reduce.matches) return pick(FLOOR, t.r * 7.3);
    const epoch = Math.floor(now / 2600 + t.r * 9);
    const wave = Math.sin((x + y) * 0.45 - now / 1100) * Math.sin(x * 0.13 - y * 0.21 + now / 4000);
    if (wave > 0.86) return pick(SCRAMBLE, hash(x, y, Math.floor(now / 90)));
    return pick(FLOOR, hash(x, y, seed + epoch));
  }
  const presenceGlyph = (e, now) => (reduce.matches ? PRESENCE[0] : pick(PRESENCE, hash(e.x, e.y, Math.floor(now / 380))));

  function drawGlyphLook(now) {
    const ox = W / 2 - 0, oy = H * 0.55;
    const F = Math.round(U * (look === 'b' ? 0.95 : 0.9));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + F + 'px ' + FONT;
    for (const it of scene(now)) {
      const dx = it.x - cam.x, dy = it.y - cam.y;
      const [sx, sy] = proj(dx, dy, 0);
      const X = ox + sx, Y = oy + sy;
      if (it.kind === 'tile') {
        const { t, th, fog } = it;
        if (t.type === 'void') continue;
        if (t.type === 'floor') {
          ctx.fillStyle = 'rgba(' + INK + ',' + (fog * (0.3 + 0.35 * t.r)).toFixed(3) + ')';
          ctx.fillText(floorGlyph(it.x, it.y, t, now), X, Y);
        } else {
          drawWallGlyphs(it, dx, dy, X, Y, ox, oy, F, now);
        }
        if (th) drawThingGlyph(th, it, X, Y, F, now);
      } else if (it.kind === 'presence') {
        ctx.fillStyle = 'rgba(' + INK + ',' + it.fog.toFixed(3) + ')';
        ctx.fillText(presenceGlyph(it.e, now), X, Y - U * 0.55);
      } else {
        drawPlayer(X, Y, now);
      }
    }
  }
  function drawWallGlyphs(it, dx, dy, X, Y, ox, oy, F, now) {
    const { t, fog } = it;
    // solid black body first, so the wall hides what is behind it
    ctx.fillStyle = BG;
    const lo = corners(dx, dy, 0), hi = corners(dx, dy, t.h);
    poly(ctx, hi, ox, oy);
    for (let e = 0; e < 4; e++) poly(ctx, [lo[e], lo[(e + 1) % 4], hi[(e + 1) % 4], hi[e]], ox, oy);
    const lift = look === 'b' ? U * 0.8 : U * 0.9;
    const side = look === 'b' ? U * 0.42 : U * 0.5;
    for (let i = 0; i < t.h; i++) {
      const y = Y - (i + 0.5) * lift;
      const flick = !reduce.matches && hash(it.x * 7 + i, it.y, Math.floor(now / 700)) < 0.04;
      ctx.fillStyle = 'rgba(' + INK + ',' + (fog * 0.45).toFixed(3) + ')';
      ctx.fillText(':|'[(i + it.x) & 1], X - side, y);
      ctx.fillStyle = 'rgba(' + INK + ',' + (fog * 0.95).toFixed(3) + ')';
      ctx.fillText(flick ? pick(SCRAMBLE, t.r) : '$S'[(i + it.y) & 1], X, y);
      ctx.fillStyle = 'rgba(' + INK + ',' + (fog * 0.3).toFixed(3) + ')';
      ctx.fillText('I!'[(i + it.x + it.y) & 1], X + side, y);
    }
    ctx.fillStyle = 'rgba(' + INK + ',' + (fog * 0.8).toFixed(3) + ')';
    ctx.fillText('_=_'[1], X, Y - t.h * lift - U * 0.2);
  }
  function drawThingGlyph(th, it, X, Y, F, now) {
    const fog = it.fog;
    if (th.kind === 'object') {
      ctx.fillStyle = 'rgba(' + INK + ',' + fog.toFixed(3) + ')';
      ctx.fillText(th.glyph, X, Y - U * 0.3);
    } else if (th.kind === 'exit') {
      const pulse = reduce.matches ? 1 : 0.6 + 0.4 * Math.sin(now / 260);
      ctx.fillStyle = 'rgba(' + INK + ',' + (fog * pulse).toFixed(3) + ')';
      ctx.font = '700 ' + Math.round(F * 1.5) + 'px ' + FONT;
      ctx.fillText('◊', X, Y - U * 0.4);
      ctx.font = '700 ' + F + 'px ' + FONT;
    } else if (th.kind === 'relic' || th.kind === 'lure') {
      ctx.fillStyle = 'rgba(' + INK + ',' + fog.toFixed(3) + ')';
      ctx.fillText(th.relic.glyph, X, Y - U * 0.4);
    } else if (th.kind === 'trace') {
      ctx.fillStyle = th.own ? 'rgba(232,68,27,' + (fog * 0.5).toFixed(3) + ')' : 'rgba(' + INK + ',' + (fog * 0.45).toFixed(3) + ')';
      ctx.fillText('▯', X, Y - U * 0.3);
    } else if (th.kind === 'hand') {
      drawHandGlyphs(th, it, X, Y, F, now);
    }
  }
  function drawHandGlyphs(th, it, X, Y, F, now) {
    // the hand turns to face you
    const [psx] = proj(player.x - it.x, player.y - it.y, 0);
    const rows = psx < 0 ? HAND.mirrored : HAND.chars;
    const lh = U * 0.5 * th.scale;
    const cw = lh * 0.62;
    const left = X - (HAND.COLS * cw) / 2;
    const top = Y - HAND.ROWS * lh + lh;
    ctx.font = '700 ' + Math.max(6, Math.round(lh * 1.05)) + 'px ' + FONT;
    for (let r = 0; r < HAND.ROWS; r++) {
      const line = rows[r];
      for (let q = 0; q < line.length; q++) {
        const ch = line[q];
        if (ch === ' ') continue;
        const x = left + (q + 0.5) * cw, y = top + r * lh;
        ctx.fillStyle = BG;
        ctx.fillRect(x - cw / 2, y - lh / 2, cw, lh);
        const shift = !reduce.matches && (ch === '$' || ch === 'S') && hash(q, r, Math.floor(now / 500) + it.x) < 0.05;
        ctx.fillStyle = 'rgba(' + INK + ',' + (it.fog * (ch === '.' ? 0.5 : 0.95)).toFixed(3) + ')';
        ctx.fillText(shift ? 'S$'[(ch === '$') ? 0 : 1] : ch, x, y);
      }
    }
    ctx.font = '700 ' + F + 'px ' + FONT;
  }
  function drawPlayer(X, Y, now) {
    const idle = !player.moving && now - player.t0 > 900;
    const off = idle && !reduce.matches && Math.floor(now / 450) % 2; // the blinking caret, never fully gone
    ctx.fillStyle = off ? 'rgba(232,68,27,0.35)' : RED;
    ctx.fillRect(Math.round(X - U * 0.28), Math.round(Y - U * 1.05), Math.round(U * 0.56), Math.round(U * 0.95));
  }

  // look C: draw the world as grey shapes on a tiny canvas (one pixel per
  // character), then write a character for each pixel by its brightness
  const buf = document.createElement('canvas');
  const bg = buf.getContext('2d', { willReadFrequently: true });
  const DENSE = " .`':;!i|?IS$$";
  function drawDensityLook(now) {
    const F = Math.max(8, Math.round(U * 0.45));
    const cw = F * 0.6, ch = F;
    const cols = Math.ceil(W / cw), rows = Math.ceil(H / ch);
    if (buf.width !== cols || buf.height !== rows) { buf.width = cols; buf.height = rows; }
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.fillStyle = '#000';
    bg.fillRect(0, 0, cols, rows);
    bg.setTransform(1 / cw, 0, 0, 1 / ch, 0, 0);
    const ox = W / 2, oy = H * 0.55;
    const grey = (v) => { const g = Math.max(0, Math.min(255, Math.round(v * 255))); return 'rgb(' + g + ',' + g + ',' + g + ')'; };
    for (const it of scene(now)) {
      const dx = it.x - cam.x, dy = it.y - cam.y;
      const [sx, sy] = proj(dx, dy, 0);
      const X = ox + sx, Y = oy + sy;
      if (it.kind === 'tile') {
        const { t, th, fog } = it;
        if (t.type === 'floor') {
          const shimmer = reduce.matches ? 0 : 0.08 * Math.sin(now / 900 + t.r * 40);
          bg.fillStyle = grey(fog * ((phase === 2 ? 0.2 : 0.1) + 0.16 * t.r + shimmer));
          poly(bg, corners(dx, dy, 0, 0.5), ox, oy);
        } else if (t.type === 'wall') {
          const lo = corners(dx, dy, 0), hi = corners(dx, dy, t.h);
          const faces = [[0, 0.18], [3, 0.18], [1, 0.62], [2, 0.36]];
          for (const [e, v] of faces) {
            bg.fillStyle = grey(fog * v);
            poly(bg, [lo[e], lo[(e + 1) % 4], hi[(e + 1) % 4], hi[e]], ox, oy);
          }
          bg.fillStyle = grey(fog * 0.95);
          poly(bg, hi, ox, oy);
        }
        if (th) {
          if (th.kind === 'hand') {
            const [psx] = proj(player.x - it.x, player.y - it.y, 0);
            const h = U * 0.5 * th.scale * HAND.ROWS, w = h * HAND.W / HAND.H;
            bg.save();
            bg.globalAlpha = Math.min(1, fog * 1.4);
            bg.translate(X, Y - h + U * 0.4);
            if (psx < 0) { bg.scale(-1, 1); bg.translate(-w, 0); bg.drawImage(HAND.shade, 0, 0, w, h); }
            else bg.drawImage(HAND.shade, -w / 2, 0, w, h);
            bg.restore();
          } else if (th.kind === 'exit') {
            const pulse = reduce.matches ? 1 : 0.7 + 0.3 * Math.sin(now / 260);
            bg.fillStyle = grey(fog * pulse);
            poly(bg, corners(dx, dy, 0.9, 0.3), ox, oy);
            bg.fillStyle = '#000';
            poly(bg, corners(dx, dy, 0.9, 0.15), ox, oy);
          } else if (th.kind === 'relic' || th.kind === 'lure') {
            const pulse = reduce.matches ? 1 : th.kind === 'lure' ? 0.5 + 0.5 * Math.sin(now / 120) : 0.75 + 0.25 * Math.sin(now / 400 + X);
            bg.fillStyle = grey(fog * pulse);
            bg.fillRect(X - U * 0.08, Y - U * 0.9, U * 0.16, U * 0.6);
            bg.fillRect(X - U * 0.3, Y - U * 0.68, U * 0.6, U * 0.16);
          } else if (th.kind === 'object') {
            bg.fillStyle = grey(fog * 0.9);
            bg.fillRect(X - U * 0.2, Y - U * 0.6, U * 0.4, U * 0.45);
          } else if (th.kind === 'trace') {
            bg.fillStyle = th.own ? 'rgba(255,0,0,' + (fog * 0.6) + ')' : grey(fog * 0.5);
            bg.fillRect(X - U * 0.15, Y - U * 0.6, U * 0.3, U * 0.5);
          }
        }
      } else if (it.kind === 'presence' && it.e.kind === 'agent') {
        // caught in the light: a tall thin shape, frozen
        bg.fillStyle = grey(it.fog * 0.9);
        bg.beginPath();
        bg.ellipse(X, Y - U * 1.3, U * 0.22, U * 1.3, 0, 0, Math.PI * 2);
        bg.fill();
      } else if (it.kind === 'presence') {
        bg.fillStyle = grey(it.fog * (0.75 + (reduce.matches ? 0 : 0.25 * Math.sin(now / 150 + it.e.x))));
        bg.beginPath();
        bg.ellipse(X, Y - U * 0.6, U * 0.35, U * 0.5, 0, 0, Math.PI * 2);
        bg.fill();
      } else {
        const idle = !player.moving && now - player.t0 > 900;
        bg.fillStyle = idle && !reduce.matches && Math.floor(now / 450) % 2 ? 'rgb(150,0,0)' : 'rgb(255,0,0)';
        const hp = phase === 2 ? Math.max(1, player.hp) / 3 : 1; // pieces of you that are left
        bg.fillRect(X - U * 0.3, Y - U * 0.1 - U * hp, U * 0.6, U * hp);
      }
    }
    const px = bg.getImageData(0, 0, cols, rows).data;
    const lumAt = (q, r) => (q < 0 || r < 0 || q >= cols || r >= rows ? 0 : px[(r * cols + q) * 4 + 1] / 255);
    ctx.font = '700 ' + F + 'px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const jitter = reduce.matches ? 0 : Math.floor(now / 320);
    const buckets = [[], [], [], []];
    const reds = [];
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const i = (r * cols + q) * 4;
      const R = px[i], G = px[i + 1];
      if (R > 90 && G < 50) { reds.push(q, r, R > 200 ? '$' : 'S', R > 200 ? 1 : 0.45); continue; }
      const v = Math.pow(G / 255, 0.75);
      if (v < 0.1) continue;
      let c;
      if (v > 0.5 && lumAt(q - 1, r) < v * 0.45) c = 'dj('[(q + r) % 3];
      else if (v > 0.5 && lumAt(q + 1, r) < v * 0.45) c = '?7)'[(q + r) % 3];
      else if (v > 0.5 && lumAt(q, r - 1) < v * 0.45) c = '.,_'[(q + r) % 3];
      else {
        let n = Math.floor(v * (DENSE.length - 1)) + (hash(q, r, jitter + (q * 13 + r) % 5) < 0.12 ? 1 : 0);
        c = DENSE[Math.max(1, Math.min(DENSE.length - 1, n))];
      }
      buckets[Math.min(3, Math.floor(v * 4))].push(q, r, c);
    }
    buckets.forEach((b, lvl) => {
      ctx.fillStyle = 'rgba(' + INK + ',' + (0.45 + lvl * 0.18).toFixed(2) + ')';
      for (let j = 0; j < b.length; j += 3) ctx.fillText(b[j + 2], b[j] * cw, b[j + 1] * ch);
    });
    for (let j = 0; j < reds.length; j += 4) {
      ctx.fillStyle = 'rgba(232,68,27,' + reds[j + 3] + ')';
      ctx.fillText(reds[j + 2], reds[j] * cw, reds[j + 1] * ch);
    }
  }

  // phase 02, drawn on top: floor text close to you, eyes in the dark, your
  // own traces (always faintly there, light or not)
  function drawDarkOverlay(now) {
    const ox = W / 2, oy = H * 0.55;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const F = Math.round(U * 0.85);
    ctx.font = '700 ' + F + 'px ' + FONT;
    const near = (x, y, r) => presences.some((e) => Math.hypot(e.x - x, e.y - y) < r);
    const px = Math.round(lp.x), py = Math.round(lp.y);
    for (let y = py - 8; y <= py + 8; y++) for (let x = px - 8; x <= px + 8; x++) {
      const l = letters.get(key(x, y));
      const th = things.get(key(x, y));
      const [sx, sy] = proj(x - cam.x, y - cam.y, 0);
      if (th && th.kind === 'trace' && th.own) {
        ctx.fillStyle = 'rgba(232,68,27,0.28)';
        ctx.fillText('▯', ox + sx, oy + sy - U * 0.3);
      }
      if (!l || solid(x, y)) continue;
      const d = Math.hypot(x - lp.x, y - lp.y);
      const vis = light(x, y) * Math.min(1, Math.max(0, (7 - d) / 3));
      if (vis < 0.05) continue;
      // letters scramble when something stands close to them
      const scrambled = !reduce.matches && (near(x, y, 3) || hash(x, y, Math.floor(now / 160)) < 0.03);
      ctx.fillStyle = BG;
      ctx.fillRect(ox + sx - F * 0.4, oy + sy - F * 0.55, F * 0.8, F * 1.1);
      ctx.fillStyle = 'rgba(' + INK + ',' + vis.toFixed(3) + ')';
      ctx.fillText(scrambled ? pick(SCRAMBLE, hash(x, y, Math.floor(now / 90))) : l.ch, ox + sx, oy + sy);
    }
    // eyes: agents you can't see, only two points that look back
    for (const e of presences) {
      if (e.kind !== 'agent') continue;
      const k = Math.min(1, (now - e.t0) / 300);
      const ex = e.fx + (e.x - e.fx) * k, ey = e.fy + (e.y - e.fy) * k;
      if (light(ex, ey) >= 0.1 || Math.hypot(ex - lp.x, ey - lp.y) > 14) continue;
      if (!reduce.matches && hash(e.x, e.y, Math.floor(now / 1700)) < 0.15) continue; // a blink
      const [sx, sy] = proj(ex - cam.x, ey - cam.y, 0);
      const a = reduce.matches ? 0.6 : 0.4 + 0.3 * Math.sin(now / 300 + e.x * 3);
      const r = Math.max(1.5, U * 0.07), gap = U * 0.16;
      ctx.fillStyle = 'rgba(' + INK + ',' + a.toFixed(3) + ')';
      ctx.fillRect(ox + sx - gap - r, oy + sy - U * 2.1, r * 2, r * 1.4);
      ctx.fillRect(ox + sx + gap - r, oy + sy - U * 2.1, r * 2, r * 1.4);
    }
  }

  // the crash: the screen tears, then a new world
  function drawCrash(now) {
    const k = (now - crash.t0) / 1600;
    if (!reduce.matches) {
      for (let i = 0; i < 14; i++) {
        const y = Math.random() * H, h = 4 + Math.random() * 40, s = (Math.random() - 0.5) * 120 * (1 - k);
        ctx.drawImage(canvas, 0, y * DPR, W * DPR, h * DPR, s, y, W, h);
      }
    }
    ctx.fillStyle = 'rgba(6,6,6,' + Math.min(0.85, k * 1.2).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(U * 1.2) + 'px ' + FONT;
    const j = reduce.matches ? 0 : (Math.random() - 0.5) * 6;
    ctx.fillStyle = '#3a6bff';
    ctx.fillText(crash.title, W / 2 + j - 2, H * 0.45);
    ctx.fillStyle = RED;
    ctx.fillText(crash.title, W / 2 + j + 2, H * 0.45);
    ctx.font = '700 ' + Math.round(U * 0.7) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(' + INK + ',0.8)';
    ctx.fillText(crash.sub, W / 2, H * 0.45 + U * 1.8);
    if (k >= 1) { phase = crash.next || 1; crash = null; newWorld(); }
  }

  // ---- Moving ---------------------------------------------------------------
  const held = new Set();
  const KEYS = {
    ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  };
  // the tile step whose direction on screen is closest to the wanted one
  function stepFor(vx, vy) {
    const len = Math.hypot(vx, vy) || 1;
    const opts = NB.map(([dx, dy]) => {
      const [sx, sy] = proj(dx, dy, 0);
      return { dx, dy, dot: (sx * vx + sy * vy) / (Math.hypot(sx, sy) * len) };
    }).sort((a, b) => b.dot - a.dot);
    for (const o of opts) {
      if (o.dot < 0.5) break;
      if (!solid(player.x + o.dx, player.y + o.dy)) return [o.dx, o.dy];
    }
    return null;
  }
  function moveTo(nx, ny, now) {
    sound.step();
    player.dir = [nx - player.x, ny - player.y];
    player.fx = player.x; player.fy = player.y;
    player.x = nx; player.y = ny;
    player.t0 = now; player.moving = true;
  }
  function updatePlayer(now) {
    if (player.moving && now - player.t0 >= STEP_MS) {
      player.moving = false;
      lookAround();
      presences.forEach(touch);
    }
    if (player.moving || crash) return;
    let vx = 0, vy = 0;
    held.forEach((c) => { vx += KEYS[c][0]; vy += KEYS[c][1]; });
    if (vx || vy) {
      player.path = [];
      const s = stepFor(vx, vy);
      if (s) moveTo(player.x + s[0], player.y + s[1], now);
      return;
    }
    if (player.path.length) {
      const [nx, ny] = player.path.shift();
      if (solid(nx, ny)) { player.path = []; return; }
      moveTo(nx, ny, now);
    }
  }
  // tap or click: walk to that tile, around walls (short search)
  function walkTo(tx, ty) {
    if (tx === player.x && ty === player.y) return;
    const start = key(player.x, player.y), goal = key(tx, ty);
    const prev = new Map([[start, null]]);
    const queue = [[player.x, player.y]];
    while (queue.length && prev.size < 5000) {
      const [x, y] = queue.shift();
      if (key(x, y) === goal) break;
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (prev.has(k) || solid(nx, ny) || Math.abs(nx - player.x) + Math.abs(ny - player.y) > 40) continue;
        if (dx && dy && (solid(x + dx, y) || solid(x, y + dy))) continue; // no squeezing between corners
        prev.set(k, [x, y]);
        queue.push([nx, ny]);
      }
    }
    if (!prev.has(goal)) return say('NO WAY THERE.');
    const path = [];
    for (let p = [tx, ty]; p && key(p[0], p[1]) !== start; p = prev.get(key(p[0], p[1]))) path.unshift(p);
    player.path = path;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (crash) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const ox = W / 2, oy = H * 0.55;
    let best = null, bestD = Infinity;
    const R = reach();
    for (let y = Math.round(cam.y) - R; y <= Math.round(cam.y) + R; y++) for (let x = Math.round(cam.x) - R; x <= Math.round(cam.x) + R; x++) {
      const [sx, sy] = proj(x - cam.x, y - cam.y, 0);
      const d = Math.hypot(ox + sx - mx, oy + sy - my);
      if (d < bestD) { bestD = d; best = [x, y]; }
    }
    if (best && bestD < U * 1.5) {
      // tapping a wall or hand walks to the nearest free tile next to it
      if (solid(best[0], best[1])) {
        const free = NB.map(([dx, dy]) => [best[0] + dx, best[1] + dy]).filter(([x, y]) => !solid(x, y))
          .sort((a, b) => Math.hypot(a[0] - player.x, a[1] - player.y) - Math.hypot(b[0] - player.x, b[1] - player.y))[0];
        if (!free) return;
        best = free;
      }
      walkTo(best[0], best[1]);
    }
  });
  window.addEventListener('keydown', (e) => {
    if (KEYS[e.code]) { held.add(e.code); e.preventDefault(); }
    if (e.code === 'KeyQ' || e.code === 'KeyE') dropRelic();
    if (e.code === 'Digit1') setLook('a');
    if (e.code === 'Digit2') setLook('b');
    if (e.code === 'Digit3') setLook('c');
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());

  const LOOK_NAMES = { a: 'ISO / TEST A', b: 'OBLIQUE / TEST B', c: 'ISO' };
  function setLook(l) {
    look = l;
    updateHud();
  }

  // ---- Header: INTERCEPT glitches out to the 404 page (as on the other pages)
  const intercept = document.querySelector('.ero-intercept');
  if (intercept) {
    intercept.addEventListener('click', () => {
      const to = '../../404.html';
      intercept.textContent = 'INTERCEPT';
      intercept.classList.add('is-active');
      if (reduce.matches) { location.href = to; return; }
      try { sessionStorage.setItem('glitch-arrive', '1'); } catch (_) { /* storage blocked: no glitch-in */ }
      document.body.classList.add('glitch-out');
      setTimeout(() => { location.href = to; }, 550);
    });
  }

  // ---- Sound (placeholder): a low hum that crackles when something is near ----
  // Off until the visitor turns it on. Made in the browser, no sound files.
  const sound = (() => {
    const btn = document.getElementById('ug-sound');
    let ac = null, on = false, hum = null, crackle = null, filter = null;
    try { on = localStorage.getItem('ero-ugame-sound') === 'on'; } catch (_) { /* off */ }
    function noiseBuffer() {
      const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }
    function start() {
      if (ac) { ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      const out = ac.createGain(); out.gain.value = 0.9; out.connect(ac.destination);
      // hum: two slightly wrong low notes through a slowly breathing filter
      filter = ac.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 260; filter.Q.value = 6;
      hum = ac.createGain(); hum.gain.value = 0;
      hum.gain.setTargetAtTime(0.06, ac.currentTime, 1.5);
      filter.connect(hum).connect(out);
      [[55, 'sawtooth'], [82.7, 'sine'], [55.6, 'triangle']].forEach(([f, type]) => {
        const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.connect(filter); o.start();
      });
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = 0.07; lg.gain.value = 120; lfo.connect(lg).connect(filter.frequency); lfo.start();
      // crackle: filtered noise that rises when a presence is close
      const n = ac.createBufferSource(); n.buffer = noiseBuffer(); n.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.5;
      crackle = ac.createGain(); crackle.gain.value = 0;
      n.connect(bp).connect(crackle).connect(out); n.start();
    }
    function set(v) {
      on = v;
      try { localStorage.setItem('ero-ugame-sound', on ? 'on' : 'off'); } catch (_) { /* fine */ }
      btn.textContent = 'SOUND: ' + (on ? 'ON' : 'OFF');
      btn.setAttribute('aria-pressed', String(on));
      if (on) start(); else if (ac) ac.suspend();
    }
    btn.addEventListener('click', () => set(!on));
    btn.textContent = 'SOUND: ' + (on ? 'ON' : 'OFF');
    btn.setAttribute('aria-pressed', String(on));
    // a remembered "on" still needs a first tap or key before the browser allows sound
    const wake = () => { if (on) start(); };
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });

    function blip(freq, len, vol, type = 'square', to = freq) {
      if (!ac || !on) return;
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(to, t + len);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + len + 0.02);
    }
    function burst(len, vol) {
      if (!ac || !on) return;
      const t = ac.currentTime, n = ac.createBufferSource(), g = ac.createGain();
      n.buffer = noiseBuffer();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      n.connect(g).connect(ac.destination); n.start(t); n.stop(t + len + 0.02);
    }
    let lastNear = 99;
    return {
      step() { blip(1800 + Math.random() * 900, 0.018, 0.012); },
      crash() {
        burst(1.2, 0.18);
        if (hum) { hum.gain.setValueAtTime(0, ac.currentTime); hum.gain.setTargetAtTime(0.06, ac.currentTime + 1.6, 1.2); }
        blip(220, 1.3, 0.08, 'sawtooth', 30);
      },
      exit() { blip(330, 0.9, 0.05, 'sine', 990); },
      hit() { burst(0.35, 0.12); blip(140, 0.4, 0.06, 'sawtooth', 60); },
      relic() { blip(880, 0.5, 0.04, 'sine', 1320); blip(1320, 0.7, 0.025, 'sine', 1760); },
      update(near) {
        if (!ac || !on || !crackle) return;
        if (Math.abs(near - lastNear) < 0.05) return;
        lastNear = near;
        const v = near > 9 ? 0 : 0.05 * Math.pow(1 - near / 9, 2) * (0.6 + Math.random() * 0.4);
        crackle.gain.setTargetAtTime(v, ac.currentTime, 0.1);
        filter.Q.setTargetAtTime(near < 4 ? 14 : 6, ac.currentTime, 0.4);
      },
    };
  })();

  // ---- Loop -------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!crash) { updatePlayer(now); updatePresences(now); }
    sound.update(presences.reduce((m, e) => Math.min(m, Math.hypot(e.x - player.x, e.y - player.y)), 99));
    const k = player.moving ? Math.min(1, (now - player.t0) / STEP_MS) : 1;
    const tx = player.fx + (player.x - player.fx) * k, ty = player.fy + (player.y - player.fy) * k;
    const follow = reduce.matches ? 1 : Math.min(1, dt * 9);
    cam.x += (tx - cam.x) * follow; cam.y += (ty - cam.y) * follow;
    const turn = reduce.matches ? 1 : Math.min(1, dt * 10);
    facing.x += (player.dir[0] - facing.x) * turn; facing.y += (player.dir[1] - facing.y) * turn;
    flicker = !reduce.matches && phase === 2 && hash(1, 2, Math.floor(now / 110)) < 0.03 ? 0.55 : 1;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!crash) {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      if (look === 'c') drawDensityLook(now); else drawGlyphLook(now);
      if (phase === 2) drawDarkOverlay(now);
    } else {
      drawCrash(now);
    }
    requestAnimationFrame(frame);
  }

  resize();
  setLook(look);
  newWorld();
  if (phase === 1) say(loadTraces().length ? 'YOU HAVE BEEN HERE BEFORE.' : 'PHASE 01. NOTHING IS EXPLAINED.');
  requestAnimationFrame(frame);
})();
