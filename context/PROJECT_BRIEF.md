# EROSION.EXE: project brief

> **Status of this file:** background context from the design conversation where the concept was shaped (the folder `context/` is for reading, not for the live site). Where it disagrees with the repo's `CLAUDE.md` or `docs/EROSION_DESIGN.md`, those win. In particular section 4 (site structure) was an early recommendation; the real structure is in `CLAUDE.md`. Crawler and concept ideas here are still current.


Written as a handoff from a design conversation into the Claude Code project. Read this first. Decisions here are the owner's (Marcus). Open questions are listed at the end.

## 1. What it is
A digital **project space / playground** for unfinished, playful, strange, chaotic work of every kind: generative crawlers, essays, videos, drawings, games, notes, odd web things. Nothing needs polish. The rules are as absent or broken as practical. It is "a framework for the random, chaotic, or things that do not have a framework (yet)".

**Why "erosion":** the framework's walls are worn thin. The content lives inside it like mites in the walls.

**Not:** a portfolio (separate, never part of this structure), a set of pets, or a site whose whole idea is "glitch". Glitch is allowed (see section 3) but it is a tool, never the design philosophy.

## 2. People and rules of the space
- For now only Marcus (and Claude) upload. Later other artists may upload.
- Future uploads are **visually anonymous**: no bylines on the site. (GitHub history may still show authors; that is fine.)
- Artist portfolios may live on the same domain later (e.g. `/marcuskje`) but are separate sites with their own look and are NOT linked from or structured by erosion.
- Planned domain: something like erosionexe.xyz. Marcus owns marcuskje.com (currently empty). Erosion is built as its own site first and attached to a domain afterwards, so **use relative paths only**.

## 3. Look
- Near-black `#060606` / `#090909`, off-white `#ece8e1`, dim `#7d7a75`, one orange line `#e8441b`.
- Small uppercase mono-ish system labels with wide letter-spacing, like a status readout.
- Thin, partly missing cell walls (the "eroded" frame). Some cells are holes.
- Creatures: lines, dots and text characters only. No glow, no filters, no images.
- Glitch is not prohibited, but it is not the design philosophy. The philosophy is thin walls, absent rules and unfinished work. Do not use glitch as a uniform skin or a default effect.
- Where glitch and breakage are welcome: the transition from the portfolio sites into Erosion.exe (a deliberately broken threshold: odd graphics, wrong crops, wrong scale), and inside pieces, where bad cropping and scaling are part of the character and must not be "fixed".
- Uploaders are free to do most things inside a cell. The structure (grid, header items, page rules) is the fixed part.
- Grid, labels and crawlers stay clean.
- Reference images: `reference/mockups/` (home, room, mobile, five hypothetical pages, one invented random piece with deliberately bad crops and scale). A hypothetical site map is in `reference/sitemap/`. All of these are inspiration only, not decisions.

## 4. Site structure (recommended)
**Navigation is not required to be a scrollable grid.** The grid is one option, not a rule. Erosion is allowed to break design and UI conventions: navigation may be strange, hidden, non-scrolling, spatial, or different from page to page. Treat anything below about the grid as a starting point, not a constraint. Keep it light and keep the header items from the repo's `CLAUDE.md`.

Static, no build step, opens from double-click (`file://`).
```
index.html              the grid
css/style.css
js/pieces.js            window.PIECES = [...]  (works from file://, no fetch)
js/grid.js              builds a randomized grid from PIECES
pieces/<slug>/index.html   one folder per piece; relative paths inside
```
- `kind` of a piece: essay, video, drawing, game, note, crawler, hole (empty cell), etc. A piece opens on its own page.
- Randomized cell sizes and per-cell worn borders make the wall irregular.
- Video: click-to-load Vimeo/YouTube facade, never autoplay embeds.
- Classes added by the site are prefixed `ero-`.
- Future anonymous uploads (not now): sandboxed iframes, file-type allowlist, EXIF stripping, approval inbox.

## 5. The crawlers
Simple orange line-and-dot creatures. They are one input among many, not the point of the site.

### Behaviour ideas agreed
- Dormant until a dot is tapped; then they wake, wander, can be dragged.
- Can morph, merge, split and mutate. **Option B chosen:** creatures swap and merge through a shared pool of points (about 200), not fixed identities.
- Eat words on pages. Eaten words damage the page visually (CSS classes only; never change real content). PURGE or reload restores everything.
- Life stages: hungry, then after ~15 words a chrysalis/egg (cluster of dots), then emerging as a new form, then the cycle continues. Forms are data.
- Infection state in `sessionStorage` so it carries across pages. PURGE clears it.

### Technique
- Dots joined by fixed-length edges, follow-the-leader movement, shape-memory pull, damping, fixed timestep, loop stops when idle.
- "Tendril": a chain of points where heading turns by a function `cf(t)` along its length. Animating `cf` gives the motion.
- Slow rule tick (~5 per second) for merge/split/mutate/decay.
- Performance: one shared canvas, transforms for visuals, read-then-write for real DOM changes, pause when the tab is hidden, respect `prefers-reduced-motion`.

### Designs so far
Four sheets (crawl_1 to crawl_40) in `reference/crawler-sheets/`. Sources are HTML/SVG with JS helpers. Direction the owner likes: the **glyph/typographic** creatures (crawl_26 family). Chosen to develop: **crawl_33 ribs, crawl_38 octobrace, crawl_39 feather**. These are animated in `demos/demo-02-crawlers-33-38-39`.

Revision 29 Oct: the heads (the circled @), the curly-brace body of crawl_38 and the antennae of crawl_39 were removed in the live demo. The creatures are now just spine/arms and limbs. The static sheets in `reference/crawler-sheets/` still show the original designs with heads. Octobrace arms still bunch a little near their start point.

## 6. Demos
| Folder | What it shows |
| --- | --- |
| `demos/demo-01-figure` | 12-dot figure; tap a dot to wake, drag to lead, PURGE to reset |
| `demos/demo-02-crawlers-33-38-39` | three glyph crawlers with idle motion and pointer/tap reaction |

## 7. Planned next steps (in order)
1. Turn the three chosen crawlers into forms (data) in one engine with a point pool.
2. Wake-by-tap, morph between forms, egg/chrysalis stage.
3. Build the main grid page (`pieces.js` + `grid.js`) with a few placeholder pieces.
4. Words as food and CSS-only page damage; PURGE.
5. `sessionStorage` infection state across pages.
6. Real pieces: essays, drawings, video facade, a small game, a note.

## 8. Ideas parked, not now
- Browser extension (Manifest V3, content script, Shadow DOM, click-through overlay) and an Electron desktop overlay. The owner said **not as pets**; revisit only if it fits erosion.
- Anonymous public uploads and moderation.

## 9. Hosting notes
GitHub Pages (1 GB site, 100 GB/month soft), Cloudflare Pages (unlimited bandwidth, 25 MB per file), Netlify (100 GB). A .xyz renews around $11 to $13 per year. Prices were checked at the time and may have changed.

## 10. Working style
The owner knows HTML, CSS, SCSS and JS and works in VS Code, but is new to Claude Code. **Explain what you change and why**, keep code readable with comments, avoid clever abstractions.

## 11. Open questions
- Final name spelling and domain.
- Whether the grid is the home page or a "room" entered from a landing screen.
- How the crawlers first appear on the grid (always visible, or hidden in one piece).
- Which pieces to make first.
