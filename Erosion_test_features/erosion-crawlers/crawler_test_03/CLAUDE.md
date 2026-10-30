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

## Current state (demo 03)
A long Wikipedia-style article ("Erosion") with three creatures that live on it. They sleep in a nest at the top; wake them by tapping them or with the buttons in the sticky top bar.
- `js/words.js`: wraps every article word in `<span class="ero-w">`, measures positions into a grid, and handles grip (`ero-gripped`, `ero-worn`) and swallow (`ero-swallowed`) with CSS classes only.
- `js/creatures.js`: a shared steering brain plus the bodies.
  - Brain: roams the whole page (always travelling to a destination word, eats it on arrival, picks the next), small random drift, rare pauses, keeps its distance from the other creatures, flees the cursor, soft walls at the page edges.
  - CRAWLER: soft wobbly body, 2-part legs spread sideways, starts with 4 and grows a pair every 3 grips (max 8). More legs = longer legs.
  - STRIDER: small body, 8 long three-jointed legs reaching out sideways, alternating spider gait.
  - SNAKE: big, fast follow-the-leader chain that swings side to side, with tendrils pulsing out of its segments in a wave from head to tail. Snacks on words on its way; grows a segment every 2 words.
  - SQUID: the snake turns into it after eating 20 words. Mantle narrow at the front and wide at the back, fins, eyes, 10 snake-like tentacles (two long ones), swims in pulses with a fish-like swing, catches words with its tentacle tips. PURGE turns it back into a snake.
  Swallowed words send a bulge through the body. All tuning numbers sit at the bottom of the file.
- `js/main.js`: the loop, pointer, buttons, layout. `ERO.creatures` is exposed for poking in the browser console; `ERO.creatures.snake.evolve()` turns the snake into the squid right away.
- PURGE sends everything back to the nest, withers extra legs, turns the squid back into a snake and restores all words.

## Saved versions
- `../crawler_test_01/`: the first word spider (one screen, scattered words).
- `../crawler_test_02/`: demo 02 (article page, crawler/snake/strider, before roaming and the squid).

## Planned next steps, in order
1. Limbs that grow: start as a plain thread, sprout buds, then gripping limbs.
2. Several creatures sharing one canvas, with a fixed budget of points (a "point pool").
3. Creature forms: worm, spider, centipede, netling (a graph), glitch (made of characters), spore.
4. Mutation rules on a slow tick (about 5 per second): merge, split, mutate, decay. Text on the page is food; eaten text gets damaged via CSS classes only, never by changing the real content.
5. Infection state saved in `sessionStorage` so it carries across pages. PURGE clears it.
6. Pet page, then host pages the crawlers can infect.
7. Video: click-to-load Vimeo/YouTube pop-up, not autoplay embeds on page load.
