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

## Current state (demo 06)
A long Wikipedia-style article ("Erosion") with three creatures that live on it. They sleep in a nest at the top; wake them by tapping them or with the buttons in the sticky top bar. `#world` spans the full window width (creatures roam into the margins); the text sits in `.ero-column`.
- `js/words.js`: wraps every article word in `<span class="ero-w">`, measures positions into a grid, and handles grip (`ero-gripped`, `ero-worn`) and swallow (`ero-swallowed`) with CSS classes only.
- `js/creatures.js`: a shared steering brain, the bodies, and a life cycle wrapper.
  - Brain: roams the whole page, sideways as well as up and down (destinations are words it eats on arrival, or spots across the page), small random drift, rare pauses, keeps its distance from the others, flees the cursor, soft walls at the page edges. Every 25-50 s it stalks the cursor and lunges; a catch makes it CLING to the cursor for 2-3.5 s.
  - Fights: when two creatures are within `fightRange` one may attack (`aggression` chance). The attacker aims at one part of the victim (`parts()`) and bites through the connection there (`hurt(now, point)`): a whole leg, one body line, a tentacle at a joint, or the snake cut in two (everything behind the bite falls off). Severed pieces become DEBRIS (`ERO.debris`): they tumble away, flicker turquoise (`--hurt: #1cb9db`, from the erosion pages) and fade. Bites count as food. Too broken (`breaks` body lines, too few legs/tentacles, snake below `minLen`) = dead: the body shatters into debris and its young form crawls home dormant.
  - Throwing: drag a creature and let go while moving; it flies with the mouse speed and bounces off the page edges (`fling`).
  - Zero-lag holding: every frame, `main.js` teleports a held creature (or one clinging to the cursor, mouth first) to sit exactly under the pointer before drawing.
  - Life cycle (`makeLifeCycle(svg, stages)`): young -> PUPA -> adult -> bigger PUPA -> final form. Each pupa is a silk egg that wobbles for 10 s and can't be bitten. Evolves after `evolveAt` food (words + bites).
    - CRAWLER (soft body, 2-part legs, grows/regrows up to 8) -> SCORPION (pincers, 8 legs, stinger) -> EMPEROR (4 pincers, 8 legs, mandibles, 3 stinger tails).
    - STRIDER (8 three-jointed legs, alternating gait) -> COLOSSUS (12 legs, mandibles, silk thread) -> BROODMOTHER (16 legs, 3 silk threads).
    - SNAKE (chain with pulsing tendrils) -> SQUID (jaws at the pointed tip, 10 long tentacles that grab letters, 2 with pincers) -> OLD ONE (`makeElder`: heaving body bulging behind, 7 blinking eyes, 8 short feeding tentacles in front, 10 long grabbing tentacles behind, two webbed bat wings).
  Tentacles (squid and old one) share `makeTentacle` / `tentUpdate` / `tentDraw` / `tentCut`. Swallowed food sends a bulge through the body. All tuning numbers sit at the bottom of the file.
- `js/main.js`: the loop, pointer (incl. its speed, for throwing), buttons, layout. `ERO.creatures` is exposed for poking in the browser console. Shortcuts on every creature: `.evolve()` (to the next pupa now), `.hatch()` (straight to the next form; call twice for the final form); `ERO.creatures.crawler.grow()` adds legs.
- PURGE sends everything back to the nest as young forms, restores lost parts and all words.

## Saved versions
- `../crawler_test_01/`: the first word spider (one screen, scattered words).
- `../crawler_test_02/`: demo 02 (article page, crawler/snake/strider, before roaming and the squid).
- `../crawler_test_03/`: demo 03 (roaming, tendril snake, squid with eyes and short tentacles, no pupa).
- `../crawler_test_04/`: demo 04 (pupa, squid with long tentacles and fins, cursor-eating, no fights or adults for crawler/strider).
- `../crawler_test_05/`: demo 05 (fights that just remove a part, one pupation, scorpion/colossus/squid as final forms, laggy dragging).
- `../creature_pngs/`: screenshots of each creature in demo 04; `demo_05/` and `demo_06/` hold the later demos (demo_06 includes emperor, broodmother and old one).

## Planned next steps, in order
1. Limbs that grow: start as a plain thread, sprout buds, then gripping limbs.
2. Several creatures sharing one canvas, with a fixed budget of points (a "point pool").
3. Creature forms: worm, spider, centipede, netling (a graph), glitch (made of characters), spore.
4. Mutation rules on a slow tick (about 5 per second): merge, split, mutate, decay. Text on the page is food; eaten text gets damaged via CSS classes only, never by changing the real content.
5. Infection state saved in `sessionStorage` so it carries across pages. PURGE clears it.
6. Pet page, then host pages the crawlers can infect.
7. Video: click-to-load Vimeo/YouTube pop-up, not autoplay embeds on page load.
