# EROSION.EXE: creature lab notes

A handoff document for the creature experiments in `erosion-crawlers/`. It is written so a future Claude session (in Claude Code or in the claude.ai "Erosion.exe Project") can pick up the work and fold it into the main EROSION.EXE site without the original chat.

Latest working version: `crawler_test_15/` (demo 15, 30 Oct 2026: demo 14 plus BUILDING: strands between words, bridges, and rarely a mended dead link). Its `CLAUDE.md` has the detailed description; this document covers the history, the ideas behind it, and how to integrate it. Demo 15 also runs live on the site: the Archive page (`site/erosion/archive/`) and the rooms built from the mockups (room, game, loop, sketch, raw, random), all sharing `site/erosion/crawlers/` (`page.js` is the runner for the rooms: trembling egg words that hatch a creature when clicked, nest cells, purge, travellers coming in). Sections 3 and 4 below describe demo 06; demo 07 changes are in section 3b.

---

## 1. What this is

EROSION.EXE is a playground site shared between artists. Simple orange line-and-dot creatures live on the pages. They eat the text, fight, evolve, and erode the site until a PURGE or a reload.

These experiments build the creatures on a long, Wikipedia-style article page ("Erosion") as a test bed.

**Fixed look and rules**
- Near-black background `#060606`, off-white text, one orange line colour `--line: #e8441b`.
- Damage colour: turquoise `--hurt: #1cb9db`, taken from the erosion pages.
- Creatures are only lines and dots: no glow, no filters, no images.
- Plain HTML, CSS and classic JS, with relative paths and no build step. It opens by double-clicking `index.html`.
- The animation loop stops when nothing moves, and the page respects `prefers-reduced-motion`.
- New CSS classes are prefixed with `ero-`.
- Eaten text is changed through CSS classes only; the real text content is never edited.

---

## 2. Version history

| Folder | What it added |
|---|---|
| `crawler_test_01/` | The first word spider: one screen, scattered words, legs latch onto words, shy of the cursor |
| `crawler_test_02/` | Long article page, three creatures (crawler, snake, strider), words get swallowed |
| `crawler_test_03/` | Roaming across the whole page, a snake with pulsing tendrils, squid evolution (with eyes, short tentacles) |
| `crawler_test_04/` | Pupa stage (a wobbling egg for 10 s), eyeless squid with 3× tentacles that grab words, pincers, cursor stalking and eating |
| `crawler_test_05/` | Fights (a bite removes a part), throwing with the mouse, clinging to the cursor, turquoise damage flicker, one pupation |
| `erosion-exe/` (demo 06) | Bites sever connections between dots (debris falls off), two pupations per creature, death returns the creature to dormant, zero-lag dragging |
| `crawler_test_07/` (demo 07) | Five forms per line with four pupas, death into food-debris and rebirth from a word, split at stage 5 into two mutants (RIBS, BRACE, QUILL), word carrying, link doors, fondness |
| `crawler_test_08/` (demo 08) | Double-click (or double-tap) a creature to damage it: the part nearest the click falls off, and only the parts near the hit turn turquoise (`ERO.zap`) |
| `crawler_test_09/` (demo 09) | Travel between pages: wild creatures slip through links to other pages, fond ones follow your clicks, and they come out on the next page as the same form with the same food and fondness (`ERO.travel`, sessionStorage). PURGE forgets them |
| `crawler_test_10/` (demo 10) | The glyph crawlers evolve into new made-up forms instead of only growing: RIBS/CHOIR/LANTERN/RELIQUARY/OSSUARY, BRACE/ASTERISK/TANGLE/MEDUSA/CHANDELIER, QUILL/PLUME/FROND/SERAPH/PALIMPSEST (`MUTANT_STAGES`). Sheet: `creature_pngs/demo_10/glyph_stages.png` |
| `crawler_test_11/` (demo 11) | Fond creatures now and then stop, face you and "speak" gibberish like `#&&[1j`. A creature you hurt flees for 5 s, and often escapes through the nearest link to another page |
| `crawler_test_12/` (demo 12) | Every legged creature has 4 to 6 legs; pupas ripple and twitch before hatching; `ERO.catalog` lists all lines and stages, and the Archive's SUMMON menu calls any of them |
| `crawler_test_15/` (demo 15) | Creatures build as well as eat: strands between words (scaffolds grow off older strands), bridges others cross, strands snap when an anchor word is eaten; rarely a dead link is mended for a while. Pictures: `creature_pngs/demo_15/` |
| `crawler_test_14/` (demo 14) | The SNAKE no longer evolves: it grows a segment per word, its mandibles grow with food and age, and at full length it lays small snake eggs. The squid family is its own line (new first stage INKLING) that only appears as a random hatching. Sheet: `creature_pngs/demo_14/snake_and_squid.png` |
| `crawler_test_13/` (demo 13) | New SIPHON line after the owner's siphonophore and hydra references: POLYP, BELL (Sarsia), CHAIN, COLONY, ARMADA. Pulsing swim, growth by budding (no pupa), beaded fishing tentacles that snag words. Feeding: hold a word to pull it out of the text and give it to a creature. Sheet: `creature_pngs/demo_13/siphon_stages.png` |
| `creature_pngs/` | Screenshots of each form (`demo_05/`, `demo_06/` subfolders) |

---

## 3. The creatures (demo 06)

Each creature goes young → PUPA → adult → bigger PUPA → final form. It evolves after eating enough (`evolveAt`); words and bites of other creatures both count as food.

| Line | Young | Adult | Final |
|---|---|---|---|
| Crawler | CRAWLER: soft body, 2-part legs, grows up to 8 | SCORPION: pincers, 8 legs, stinger | EMPEROR: 4 pincers, mandibles, 3 stinger tails |
| Strider | STRIDER: 8 three-jointed legs | COLOSSUS: 12 legs, mandibles, silk thread | BROODMOTHER: 16 legs, 3 silk threads |
| Snake | SNAKE: chain with pulsing tendrils | SQUID: no eyes, jaws at the pointed tip, 10 long tentacles that grab letters, 2 with pincers | OLD ONE: heaving body, 7 blinking eyes, 8 feeding and 10 grabbing tentacles, webbed bat wings |

**Behaviour shared by all creatures**
- They roam the whole page, eat words, keep a distance from each other and flee the cursor.
- Every 25 to 50 seconds they stalk the cursor and lunge; if one catches it, it clings for 2 to 3.5 seconds.
- When close, they fight. A bite cuts one connection: a leg, a body line, or a tentacle at a joint. The cut-off piece falls away as debris that flickers turquoise.
- A creature that is too broken dies: it shatters and its young form crawls home dormant.
- You can drag and throw them, and they bounce off the page edges.
- PURGE heals everything and restores all the words.

---

## 3b. Demo 07 (from the owner's answers, 29 Oct 2026)

- Creatures are inhabitants with no set purpose. They hatch from words (the word cracks and its letters become the body), eat words, move words, crawl into links, evolve, fight, sleep and die. Both virus and cleanup.
- Visitors are guests: they poke, feed, drag and throw. The creatures live on their own.
- 5 stages with a pupa between each. Only stage 5 can split; the split gives two new small stage 1 mutants of other species.
- Dead creatures fall apart; the pieces spread out and fade after 5 s, and are food meanwhile. Pupas can be eaten too.
- Eaten words can be carried and dropped into other scars.
- Fondness grows while you stay near without throwing: it then follows you, brings word gifts and defends you.
- All forms are stand-ins until the owner draws real designs.

| Line | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Crawler | CRAWLER | SCORPION (6 legs, 2 pincers) | EMPEROR | WARLORD (fewer, thick legs) | THRONE (letter body) |
| Strider | STRIDER (2-part legs) | COLOSSUS | BROODMOTHER | WEAVER (web) | CATHEDRAL (bracket legs) |
| Snake | SNAKE | SQUID | OLD ONE | LEVIATHAN (chained second body) | ABYSS (glyph ribs) |
| Mutant | RIBS / BRACE / QUILL L1 | L2 | L3 | L4 | L5 (splits again) |

---

## 4. Techniques worth keeping (the building blocks)

These are the reusable parts to carry into the main project:

- **SVG overlay over the page.** One `<svg>` covers the whole page with `pointer-events: none`; only the creatures' hit circles catch clicks. Positions are page coordinates, so creatures scroll with the text.
- **Words as food (`words.js`).** Every word is wrapped in `<span class="ero-w">`, and their positions are measured into a 64 px grid for quick "what word is near here" lookups. The states are the classes `ero-gripped`, `ero-worn` and `ero-swallowed`; a swallowed word fades and leaves a dotted scar.
- **Fixed 60 Hz loop** that only runs while something moves (`main.js`).
- **Body types:**
  - Soft body: Verlet points held together by springs. Wobbly, and its lines can be cut.
  - Chain: follow-the-leader segments, used for the snake, tentacles, tails and silk.
  - Jointed legs: 2-bone or 3-joint IK. The foot plants on a word and the knee bends automatically.
  - Tentacles: chains that can grip a point and pull, FABRIK-style.
- **One shared brain (`steer()`).** It handles destinations, wander, separation, fear, stalking, fights and throwing, so a new body only has to supply its shape.
- **Life cycle wrapper.** `makeLifeCycle(svg, [stages])` chains forms together, so any body can evolve into any other body.
- **Debris.** Severed pieces become free lines that tumble, flicker and fade.
- **Zero-lag holding.** Each frame, a held or clinging creature is moved bodily under the pointer before drawing.
- **Tuning.** All numbers (speeds, sizes, `evolveAt`, aggression) sit in config objects at the bottom of `creatures.js`.

---

## 5. Designing new creatures from sketches

The owner plans to draw creature designs. The agreed colour code:

| Colour | Means | Built as |
|---|---|---|
| Black | Body | Soft, wobbly outline (Verlet) |
| Blue | Walking legs | Legs that step and grip letters; dots mark joints |
| Green | Trailing parts | Follow-the-leader chains: tails, tentacles, silk |
| Red | Mouth | Eating and biting point |
| Purple | Grabbers | Pincers, claws, jaws that open and close |
| Yellow | Moving add-ons | Wings, pulsing tendrils, blinking eyes |

Marks that work in any colour:
- An arrow shows the front.
- A dot is a joint; more dots make a bendier limb.
- An **X** is a weak spot, where bites cut easily.
- Short written notes cover anything else ("slow", "curls", "drags behind").

Life-cycle stages are drawn side by side with arrows between them. A top-down view works best.

---

## 3c. Demo 09: travel between pages

- Links to other pages of the site are exits: words inside them, and links with no words (drawings, drawn doors) registered with `ERO.words.door(a)`.
- A wild creature (no nest) heads for an exit on about 4% of its trips (`EXIT_CHANCE`). It slips through and is gone from the page.
- A creature that is fond of you follows you when you click any link. A nest creature that does this leaves its nest, and the nest hatches a new one later.
- What travels: line, form (stage 1-5; a pupa travels as the form it was about to become), food eaten and fondness. It waits in `sessionStorage` (key `ero-travellers`, this tab only, at most 12) under the page it went to, and comes out when that page opens: through the link back to where it came from if that is on screen, otherwise out of a word. It is always wild on arrival.
- PURGE clears every traveller. Pages without the creature scripts (the front page) keep their travellers waiting until the list is full.

**Clickable words (owner, 29 Oct 2026, second round).** The creatures are inhabitants, not a feature, but the clickable words got too hard to find. Now (`page.js`, `crawlers.css`): no colour flicker, a small twitch every 3 to 6 seconds (each word on its own beat), red under the cursor, 3 to 5 per page (random; `data-eggs` on #world still overrides), a new one 6 to 14 s after a hatch, and never on see-through text. The glyph crawlers the owner likes (RIBS, BRACE, QUILL = crawl_33, 38, 39) are 70% of what hatches (`GLYPH_SHARE`).

## 3d. Demo 10: glyph crawler stages

The owner asked for every creature to evolve, with made-up creatures where a line had no real stages. The glyph crawlers only grew bigger, so each now has five different forms (stand-ins until real designs exist):

| Kind | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Ribs (crawl_33) | RIBS | CHOIR (inner rib pair, S curls) | LANTERN (eyes, tail, round brackets) | RELIQUARY (crown ^*^) | OSSUARY (3 rib pairs, splits) |
| Brace (crawl_38) | BRACE | ASTERISK (arms of stars) | TANGLE (writhing, beaded) | MEDUSA (10 arms, ring of dots) | CHANDELIER (12 arms, short and long, splits) |
| Quill (crawl_39) | QUILL | PLUME (3 barbs a side) | FROND (forked barbs) | SERAPH (two wing feathers) | PALIMPSEST (letters at the tips, splits) |

## 3e. Demo 11: talking and running away (owner, 29 Oct 2026)

- Fond creatures already bring word gifts. Now, every 7 to 16 s while your cursor is on the page, a fond one stops, turns to you and types out a short burst of gibberish beside its mouth (`say()` in creatures.js, class `ero-speech`). It flickers a sign or two and fades after 2.6 s.
- A creature you hurt (double-click) runs away for 5 s. With a 60% chance it makes for the nearest link to another page and escapes through it; it then turns up on that page like any traveller.
- QUILL and PLUME got a small swaying tail with a dot at the end (owner's request).

## 3f. Demo 12 (owner, 29 Oct 2026)

- Legs: at most 6 and at least 4 on every legged creature (pincer arms don't count). The strider line walks on 6 everywhere now, so CATHEDRAL has 6 bracket legs instead of 8.
- Pupas (the silk eggs) squirm: a ripple runs round the shell and something inside jerks now and then, more and harder close to hatching. They could already be torn open and killed (4 tears) by creatures and by a double-click.
- Summon: the Archive's rail has SUMMON (a menu of all 30 line/stage pairs) and CALL. The creature hatches out of a word on screen at that stage.

## 3g. Demo 13: the siphon line and feeding (owner, 29 Oct 2026)

- References: Sarsia siphonophora (Haeckel; Henri Reiling's watercolour), physonect diagrams (float, nectosome of paired numbered swimming bells, siphosome of repeating units), Forskalia, Pambikalbae, and a hydra.
- POLYP (hydra: stalk, foot, crown of arms, a growing bud) -> BELL (Sarsia: bell with a coiled tube, stem of tiny bells, four long tentacles) -> CHAIN -> COLONY -> ARMADA (float, numbered bell pairs, stem with bract, feeding polyp and beaded fishing tentacle per unit).
- It swims in pushes, grows by budding (new bells and units as it eats; next stage buds out with no pupa), its tentacle tips snag words, a bite knocks off a bell or cuts the stem, and ARMADA splits into two polyps.
- Feeding: hold a word (about 0.4 s) to pull it out; let go on a creature to feed it from your hand (+30% fondness, it talks), or anywhere to leave it as food for 25 s.

---

## 3h. Demo 14: the snake grows, the squid goes its own way (owner, 30 Oct 2026)
Owner: "the snake should not evolve into the squid. Snake should just grow more/new segments as it eats. Potentially bigger mandibles as it gets older/has eaten more. It will at its peak of size lay small snake eggs here and there. Squid-family will be its own family, squid-line only possible as a random spawn."
- SNAKE (`ERO.makeSnake`, one stage): 12 segments when it hatches, one more per word, 54 at full length. Mandibles are two hooks at the head that grow with food and with time awake (`jawFood` 60, `jawAgeMs` 8 min, added up); past a third of the way they get a tooth, past 60% they are drawn thick. The head grows a little too.
- SNAKE EGGS (`ERO.debris.layEgg`): at full length it lays one from its tail every 16 to 30 s and loses 4 segments (it eats them back). The egg rocks with a little curled snake inside and hatches into a young snake after 14 to 22 s through the page's `ERO.hatchLine(x, y, 'snake')`. Eggs are food for other creatures (snakes leave them alone), a double-click cracks one, PURGE clears them, at most 4 per page, and no egg when the page is nearly full (`ERO.room()`).
- SQUID line (`ERO.makeSquid`, line `squid`): INKLING (made up: half-size squid, six arms, two short pincer arms) -> SQUID -> OLD ONE -> LEVIATHAN -> ABYSS (splits into glyph crawlers as before). It has no nest and no egg: on the rooms it is one of the random hatchings (`page.js` spawn pool), on the Archive and the demo 20% of the wild hatchings. It is in the Archive SUMMON list so it can be looked at.
- Archive: NEXT STAGE on a snake grows it to full length at once; SPLIT is off for lines that cannot split; the food bar shows WORDS n OF 42 TO FULL SIZE for a snake.

## 3i. Demo 15: building and mending (owner, 30 Oct 2026)
From the manifesto work: the creatures are partly a metaphor for the agents that make the site; they construct as well as eat, they are the site and the coding itself. "Deletion is mutation." Dead links are skeletons of what was once there. The owner picked: build structures (2) and, rarely, repair dead links (3).
- STRANDS (`ERO.build`): about 1 trip in 8, a creature spins a thread from one word to another nearby; a third start off the middle of an older strand, so scaffolds grow (max 30 per page). Builders don't eat their anchor words and don't fight or scavenge while building.
- BRIDGES: creatures near a strand's end often cross it, keeping to the line; it shivers under them.
- SNAPPING: when an anchor word is eaten the strand snaps and falls as food, and strands hanging off it snap too.
- MENDING (rare): with the top of the page in view, a creature climbs under a dead header link (`a.ero-dead`), weaves five threads up to it, and the link loses its strike-through and leads to another page for 1 to 2 minutes, then dies again (threads fall). One at a time, 90 s apart. The Archive log notes it.
- PURGE clears strands and kills mended links again.

## 6. Integrating into the main EROSION.EXE site

Suggested order (it matches the "Planned next steps" list in `erosion-exe/CLAUDE.md`):

1. Copy `erosion-exe/js/words.js`, `creatures.js` and `main.js` plus the `ero-` CSS into the main project as one self-contained "creature layer" that any page can include.
2. Make the layer work on any page: wrap the text of whatever main element the page has instead of `#article`, and place the nest wherever it fits.
3. Keep creature state across pages in `sessionStorage` (form, food eaten, which words were swallowed), and have PURGE clear it. Done for the creatures themselves in demo 09 (see 3c); swallowed words still heal on reload.
4. Add a point budget if many creatures share a page, to keep it light.
5. Add new forms from sketches through `makeLifeCycle` and the shared brain.

**Ideas raised but not built yet**
- A chrysalis-stage prompt pasted during demo 03 referenced a `figure.js` from another version of the project. It was never implemented; the PUPA stage covers part of it.
- Limbs that grow from threads into buds and then into limbs.
- Other creature forms: worm, centipede, netling (graph), glitch (made of characters), spore.
- Mutation rules: merging, splitting, decay.
- Per-artist hidden portfolio folders with their own look.

---

## 7. Testing notes (for Claude)

- Node is not installed on the owner's PC. Testing used headless Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`) with `--virtual-time-budget`, `--dump-dom` and `--screenshot`.
- Headless `requestAnimationFrame` barely runs, so tests replace it with a `setTimeout` shim.
- For screenshots, teleport the creature into view instead of scrolling the page.
- Console shortcuts: `ERO.creatures.snake.evolve()` starts the next pupa now, `.hatch()` jumps to the next form, and `ERO.creatures.crawler.grow()` adds legs.
