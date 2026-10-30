# EROSION.EXE

Standalone project. It is its own world, separate from the portfolio website. It may be attached to the portfolio's domain later, so keep every path relative and do not depend on any shared CSS or JS.

## The concept
A playground for unfinished, playful, in-progress work, shared between artists. Not serious. Generative "crawlers" (simple orange line-and-dot creatures) live on the site. They can be woken, released, mutate and morph into each other, and erode the pages until a purge or reload. Each contributing artist may later get their own hidden portfolio folder (for example `/friend1/`) with its own look.

## Look
- Near-black background, off-white text, one orange line colour (`--line`).
- Small uppercase system labels, wide letter-spacing, like a status readout.
- Super simple: lines and tiny dots, no glow, no filters, no images in the creatures.

## Rules for building
- Keep it light. Draw only lines and dots. Stop the animation loop when nothing is moving.
- Respect `prefers-reduced-motion`.
- Relative paths only (`./css/style.css`). No build step for now: plain HTML, CSS and classic JS so it opens by double-clicking `index.html`.
- Explain what you change as you go. The owner is learning Claude Code and wants to understand the code.
- Prefix any new CSS classes that could clash later with `ero-`.

## Current state (demo 10)
Demo 10 = demo 09 plus five real stages for the glyph crawlers ("mutants" in the code). Before, each kind only grew bigger level by level; now each stage is a different made-up creature (stand-ins until the owner draws real ones), set in `MUTANT_STAGES` near the bottom of `js/creatures.js`:
- RIBS -> CHOIR (inner rib pair curling the other way) -> LANTERN (eyes, curled tail, round brackets) -> RELIQUARY (crown of ^*^) -> OSSUARY (three rib pairs, long spine, splits)
- BRACE -> ASTERISK (arms of stars) -> TANGLE (writhing beaded arms) -> MEDUSA (10 arms, a turning ring of dots round the hub) -> CHANDELIER (12 arms, short and long in turn, star ring, splits)
- QUILL -> PLUME (three barbs a side) -> FROND (every barb forks) -> SERAPH (two long wing feathers) -> PALIMPSEST (letters at the barb tips, crown, splits)
`makeGlyph` has new options for this (`glyphs`, `crown`/`crownMode`, `pairs`, `tail`, `armText`, `rings`, `curl`, `beads`, `barbs`, `branch`, `wings`, `tipText`), described above the function. Brace arms fan out wider the more arms there are.

### Demo 09
Demo 09 = demo 08 plus TRAVEL between pages (`ERO.travel`, bottom of `js/creatures.js`):
- Links to other pages of the site are exits. `words.js` gives words inside them a `page` (the address), and `ERO.words.door(a)` adds links with no words (drawings, drawn doors). `ERO.words.randomExit()` picks one.
- A WILD creature (no nest: `opts.mutant`) now and then (`EXIT_CHANCE` 4% of its trips) walks to an exit and slips through: mood LEAVING, the link flickers (`ero-portal`), and it is gone from the page.
- A creature that is FOND of you follows you when you click any link (`ERO.travel.follow(all, href)`). A nest creature that follows you leaves its nest; the nest hatches a new one later (mood LEFT THE PAGE).
- What travels: `c.pack()` = line, kind, stage (1-5, a pupa counts as the next form), food eaten, fondness. It waits in `sessionStorage` key `ero-travellers` (this tab only, at most 12) under the path of the page it went to.
- The next time that page opens, the runner calls `ERO.travel.arrivals()` and `c.arrive(x, y, t)`: it comes out of the link back to where it came from if that is on screen, otherwise it hatches out of a word. On arrival it is always wild.
- PURGE calls `ERO.travel.clear()`.
- This lab page only has `#` links, so nobody leaves from here. Travel is live on the site rooms (`site/erosion/crawlers/page.js`) and the Archive (`archive.js`).

### Demo 08
Demo 08 = demo 07 plus visitor damage: double-click (or double-tap) a creature and `ERO.zap(c, point, now)` cuts off the part nearest the click (the form's own `hurt()`), and only lines, dots and letters within 42 px of the hit turn turquoise for 1.4 s (class `ero-zap`, see `zapPaint` in `js/creatures.js`). Damage also costs fondness. `ERO.words.list` exposes the wrapped words.

### Demo 07 base
Same article page and the same three nest creatures as demo 06, now with the full life cycle the owner described (interview 29 Oct 2026, see `../CREATURE_LAB_NOTES.md`).
- Five forms per line, with a PUPA between each. A pupa can be bitten and torn open (4 bites), and is then food.
  - CRAWLER -> SCORPION (6 legs, 2 pincers, stinger) -> EMPEROR -> WARLORD (fewer, thick legs, 3 pincer tails) -> THRONE (body made of eaten letters, 5 stingers).
  - STRIDER -> COLOSSUS -> BROODMOTHER -> WEAVER (spins a web between letters) -> CATHEDRAL (8 legs written in brackets). All strider legs have 2 segments now (less lag).
  - SNAKE -> SQUID -> OLD ONE -> LEVIATHAN (drags a second body on a chain) -> ABYSS (glyph spine of ribs, eyes).
- `evolveAt` / `splitAt` per stage sit in `ERO.makeCrawler` etc. at the bottom of `js/creatures.js`.
- Death: the creature falls apart into debris that fades after 5 s (`CORPSE_MS`); the pieces are food. A nest creature hatches again 9-17 s later out of a word on screen (the word cracks, its letters fly into the new body).
- Split: a fifth form that eats `splitAt` dies and two small MUTANTS crawl out (`makeGlyph`: RIBS, BRACE, QUILL, from crawl_33/38/39). Mutants have 5 levels and can split again. Now and then one hatches from a word by itself (only while something is awake). At most 12 creatures.
- Words: some creatures carry a swallowed word and drop it into another scar; words inside `#` links are doors (the creature comes out where the link points).
- Fondness: stay near a creature (or hold it gently) and it grows fond: follows you, brings word gifts, attacks creatures near your cursor. Throwing undoes it.
- `js/main.js`: loop, pointer, buttons, mutants (`ERO.spawnMutant(x, y, kind)`), wild hatching, purge (also removes mutants).
- Console: `ERO.creatures.crawler.evolve()`, `.hatch()`, `.split()`, `.kill()`.

The same creature code is used live on the site's Archive page: `site/erosion/archive/` with the shared copy in `site/erosion/crawlers/`. Change it here first, then copy `words.js` and `creatures.js` across.

## Saved versions
- `../crawler_test_01/`: the first word spider (one screen, scattered words).
- `../crawler_test_02/`: demo 02 (article page, crawler/snake/strider, before roaming and the squid).
- `../crawler_test_03/`: demo 03 (roaming, tendril snake, squid with eyes and short tentacles, no pupa).
- `../crawler_test_04/`: demo 04 (pupa, squid with long tentacles and fins, cursor-eating, no fights or adults for crawler/strider).
- `../crawler_test_05/`: demo 05 (fights that just remove a part, one pupation, scorpion/colossus/squid as final forms, laggy dragging).
- `../crawler_test_09/`: demo 09 (travel between pages).
- `../crawler_test_08/`: demo 08 (zap: double-click damage).
- `../crawler_test_07/`: demo 07 (five forms, mutants, fondness, link doors).
- `../erosion-exe/`: demo 06 (two pupations, three forms per line, death sends the young form home dormant).
- `../creature_pngs/`: screenshots of each creature in demo 04; `demo_05/` and `demo_06/` hold the later demos (demo_06 includes emperor, broodmother and old one).

## Planned next steps, in order
1. Limbs that grow: start as a plain thread, sprout buds, then gripping limbs.
2. Several creatures sharing one canvas, with a fixed budget of points (a "point pool").
3. Creature forms: worm, spider, centipede, netling (a graph), glitch (made of characters), spore.
4. Mutation rules on a slow tick (about 5 per second): merge, split, mutate, decay. Text on the page is food; eaten text gets damaged via CSS classes only, never by changing the real content.
5. Infection state saved in `sessionStorage` so it carries across pages. PURGE clears it. (Creatures travel since demo 09; eaten words do not carry over yet.)
6. Pet page, then host pages the crawlers can infect.
7. Video: click-to-load Vimeo/YouTube pop-up, not autoplay embeds on page load.
