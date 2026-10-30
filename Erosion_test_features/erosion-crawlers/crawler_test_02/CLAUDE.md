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

## Current state (demo 02)
A long Wikipedia-style article ("Erosion") with three creatures that live on it. They sleep in a nest at the top; wake them by tapping them or with the buttons in the sticky top bar.
- `js/words.js`: wraps every article word in `<span class="ero-w">`, measures positions into a grid, and handles grip (`ero-gripped`, `ero-worn`) and swallow (`ero-swallowed`) with CSS classes only.
- `js/creatures.js`: a shared steering brain (wander, pauses, soft walls at the visible screen edges, flee the cursor, catch up when you scroll away) plus three bodies:
  - CRAWLER: soft wobbly body, 2-part legs, starts with 4 and grows a pair every 3 grips (max 8). More legs = longer legs.
  - STRIDER: small body, 8 long three-jointed legs, alternating spider gait.
  - SNAKE: follow-the-leader chain that swings side to side, hunts words ahead of it and swallows them; grows a segment every 2 words.
  Swallowed words send a bulge down the body. All tuning numbers sit at the bottom of the file.
- `js/main.js`: the loop, pointer, buttons, layout. `ERO.creatures` is exposed for poking in the browser console.
- PURGE sends everything back to the nest, withers extra legs and restores all words.

## Planned next steps, in order
1. Limbs that grow: start as a plain thread, sprout buds, then gripping limbs.
2. Several creatures sharing one canvas, with a fixed budget of points (a "point pool").
3. Creature forms: worm, spider, centipede, netling (a graph), glitch (made of characters), spore.
4. Mutation rules on a slow tick (about 5 per second): merge, split, mutate, decay. Text on the page is food; eaten text gets damaged via CSS classes only, never by changing the real content.
5. Infection state saved in `sessionStorage` so it carries across pages. PURGE clears it.
6. Pet page, then host pages the crawlers can infect.
7. Video: click-to-load Vimeo/YouTube pop-up, not autoplay embeds on page load.
