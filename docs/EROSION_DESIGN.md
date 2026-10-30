# Erosion.exe: theme and design rules

Taken from the old design document (Designdokument, October 2026), CLAUDE.md, the build log and the current code. Only the parts about Erosion.exe. The full original documents are in the backup, `Desktop\MarcusKje_portfolio\docs`.

## Concept

Erosion.exe is its own universe with its own rules: a black terminal room that glitches, types, deletes itself and crashes into a 404 page. A free chaos and play room for half and whole ideas, texts and images that are edited and played with, things that are not a "product". It is allowed to be messy and unfinished. Right now it is a one-page preview ("under development").

## Colours

| Use | Hex |
|---|---|
| Background | `#000` (pure black marks Erosion as "another system") |
| Text | `#e8e6df` |
| Dimmed text (struck-through links) | `#cfccc4` |
| Small grey text (LAST MUTATION) | `#9a978f` |
| Accent red | `#e34624` |
| Glitch blue (red/blue split) | `#3a6bff`, `#6f6cff` on the 404 |
| Turquoise (the red inverted, figure hover on sub-pages) | `#1cb9db` |
| Thin rule | `#262626` |

Red is never decoration. It means "you are here", "something is happening now" or an error/status line.

## Type

- One typeface: Inter, self-hosted in `site/fonts` (no third-party requests).
- Body 15 px. Header 13 px (11 px under 1000 px). Status lines 10 px in red. Sub-page titles light (300), `clamp(30px, 4vw, 58px)`.
- Labels and system text in capitals, written like file names and commands: `[ ZINE_003.PDF ]`, `NOTE_027`, `[ RETURN TO VOID ]`, `00 OBJECTS AVAILABLE`.

## Signature elements

- The red wireframe figure (also the temporary favicon, on a black square).
- Struck-through dead links (RANDOM / OFFLINE, INDEX / 404). On hover the strike line glitches away with a red/blue split.
- EROSION.EXE / RUNNING: hover shows a flickering red INTERCEPT. Click (never hover) deletes all text backwards and glitches into the 404 page.
- Red block caret while text is typed or deleted.
- A big black arrow cursor (Windows "black large" look), `site/img/cursor`.
- Placeholder items and messages: "!! buffer fault", "LAST MUTATION: ??.??.??", "404 / PAGE MISSING / UNDER CONSTRUCTION".

## Motion

- Erosion is the loud part. Arrival: the page glitches in, then all text is typed out like a terminal. Leaving by any link: the page glitches out and the next page glitches in.
- Blinking cursors only in Erosion.exe and on the 404 page.
- No soft cross-fade into or out of Erosion: it has its own glitch.
- All animation is off when the visitor has chosen reduced motion.

## Structure

- `site/erosion/index.html`: the main Erosion page. `site/erosion/random/` and `site/erosion/archive/` (INDEX): dummy sub-pages with the figure as a link back and `[ RETURN TO VOID ]`.
- `site/404.html`: "404_" in Erosion style with a blinking cursor and a way home.
- One folder per experiment: `site/erosion/<name>/`.
- No social media links and no portfolio header or footer.

## Accessibility

- Screen readers get the full text at once; the typing is only visual.
- Keyboard: everything reachable with Tab, with a visible focus outline.
- Contrast checked against WCAG AA.

## Rules from Marcus

- Never use the em-dash character.
- Ask before changing Marcus' own wording.
- Site language is English.
