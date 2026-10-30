# How we work on Erosion.exe

## In one line

`main` is what goes live. Every experiment is tried on its own **branch** in its own **thread**, and when it's ready it is merged into `main` through a **pull request**.

## Folder map = thread map

Each folder has a thread in the Claude project with the same name.

```
erosion_WIP_workfolder/
  site/                     what goes live (blank front page + Erosion)
    erosion/                Erosion.exe itself                thread "Erosion.exe"
      <name>/               one folder per experiment         thread "Exp: <name>"
  ideas/                    inbox for videos, links, notes    thread "Ideas inbox"
  docs/                     this guide, Erosion design rules
  assets/                   original sources (only on your PC, not on GitHub)
  tools/                    local preview script
```

| What | Where |
|---|---|
| Working folder | `Desktop\erosion_WIP_workfolder` |
| Code on GitHub | https://github.com/mrcs-kje/Erosion_project |
| New site, once published | https://mrcs-kje.github.io/Erosion_project/ |

## Using the threads

- **Main project chat:** post each new idea or task as its own message. Claude starts a thread for it.
- **Inside a thread:** everything about that one thing goes there: videos, links, feedback, "merge it".
- **Lost?** Ask in the main chat "status of everything?" and you get one line per thread.
- Finished or dropped threads get marked resolved and fold away.

## The life of one experiment

1. **Idea:** you post it (video, link, sketch, a few words). It's saved in `ideas/`.
2. **Thread and branch:** Claude starts a thread "Exp: <name>" and a branch `exp/<name>`. The work lives in `site/erosion/<name>/`, so it can't break the rest of Erosion.
3. **Build and look:** Claude builds it, you look and comment. Nothing is live yet.
4. **Pull request:** when it's ready, Claude opens a pull request, a GitHub page showing exactly what will change.
5. **Merge:** you say "merge it" or click the green button on GitHub. It's live a minute or two later.

Experiments that never get merged stay on their branch. Nothing is lost.

## Words you'll see

- **Repo (repository):** the project on GitHub, with its full history.
- **Branch:** a separate copy to try things on. `main` is the live one.
- **Commit:** a saved step with a short note.
- **Push:** send saved steps from the PC up to GitHub.
- **Pull request (PR):** a request to bring a branch into `main`, showing what changes.
- **Merge:** accept the pull request, so the change goes live.
