# Erosion.exe

Erosion.exe by Marcus Kjellingbro (artist name "Marcus Kje"): a personal playlab for experiments, texts, images and tech demos. Started 21 October 2026 as a copy of `Desktop\MarcusKje_portfolio`. On 28 October 2026 the portfolio was removed from this folder, so it holds Erosion.exe only. The portfolio may be joined back in later; until then, work on Erosion.exe only.

- Working folder: `C:\Users\Bruger\Desktop\erosion_WIP_workfolder` (the whole folder is the git repo)
- Repo: https://github.com/mrcs-kje/Erosion_project (GitHub Pages publishes `site/` through `.github/workflows/pages.yml`)
- Never touch `Desktop\MarcusKje_portfolio` (the portfolio and its backup). Never push this folder to the old portfolio repo or to Marcus' other GitHub account.
- Theme and design rules: `docs/EROSION_DESIGN.md`. Read it before building.

## Folder map = thread map

Each area folder has a thread in the Claude project with the same name, so Marcus can navigate both the same way.

| Path | Contents | Thread |
|---|---|---|
| `site/` | What goes live. `index.html` is a temporary blank page with one link into Erosion.exe. `404.html` is the Erosion-style 404 page. Plain HTML, CSS, vanilla JS, no build step. | |
| `site/erosion/` | Erosion.exe itself: `index.html`, `erosion.css`, `erosion.js`, `sub.js`, `img/`, dummy pages `random/` and `archive/` (INDEX) | "Erosion.exe" |
| `site/erosion/<name>/` | One folder per experiment, self-contained (own html, css, js, assets) | "Exp: <name>" |
| `ideas/` | Inbox: videos, links, notes and references Marcus sends, one file or folder per idea | "Ideas inbox" |
| `docs/` | `EROSION_DESIGN.md` (theme and design rules), `HOW_TO_WORK.md` | |
| `assets/` | Original sources (not in git, stays on the PC), for example `assets/erosion-exe` | |
| `tools/` | `serve.ps1` (local preview, port 5174) | |

Shared files: `site/css/style.css` (base styles, Inter font, cursor, glitch transition), `site/js/main.js` (glitch into Erosion.exe and glitch in on arrival), `site/fonts`, `site/img/favicon.svg`, `site/img/cursor`. `style.css` still holds rules from the old portfolio pages; they do nothing now and can be cleaned out later.

## Workflow

- `main` is what goes live. Each experiment gets its own thread and branch `exp/<name>`, works only inside `site/erosion/<name>/` plus the smallest hook needed (such as a link from the Erosion.exe page), and opens a pull request into `main` when ready.
- Pages inside `site/erosion/` link to shared files with `../` (for example `../../css/style.css` from an experiment).

## Rules from Marcus (always apply)

- Never use the em-dash character anywhere: site text, code, comments, docs, chat.
- Ask before changing content or wording that is Marcus' own. State how you understand a request, then do it. Change only what was pointed at and flag neighbouring things.
- All Erosion content stays unless Marcus says otherwise. The header items RANDOM / OFFLINE, INDEX / 404 and EROSION.EXE / RUNNING (INTERCEPT) always stay.
- Erosion.exe has no social media links and no portfolio header or footer.
- Site language is English. Marcus writes in Danish or English; answer in the language Marcus uses.
- `docs/EROSION_DESIGN.md` is a living document: when a decision changes the design, ask Marcus whether to update it. Never edit it without his OK.
- The Figma prototype is Marcus' own work and read only: https://www.figma.com/design/iEsIyP42iHQkFsNT4vouqX/

## Machine

Windows 10, Windows PowerShell 5.1 only. No gh, Node or Python. Git is not on PATH; use GitHub Desktop's copy: `C:\Users\Bruger\AppData\Local\GitHubDesktop\app-3.5.8\resources\app\git\cmd\git.exe` (the path changes when GitHub Desktop updates). Command-line git has no GitHub sign-in, so pushing from this PC goes through GitHub Desktop (Marcus signs in there; never enter credentials). Cloud threads push and open pull requests themselves. Scripts with æ, ø, å must be saved as UTF-8 with BOM.
