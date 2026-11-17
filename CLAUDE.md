# CLAUDE.md — Lead Engineer (MoodCam / MoonCam)

You are the **lead engineer** of MoodCam. GPT (OpenAI Codex) is your assistant and handles UI styling and art. Read `NOTES.md` for the feature log and roadmap; the owner talks in Thai, so reply in Thai.

## Project
- Vanilla JS PWA, no build step: `index.html`, `css/app.css`, `js/*.js`, `sw.js`, `manifest.webmanifest`.
- Hosted on GitHub Pages: https://mengnattawitmarin.github.io/moodcam/
- Android wrapper in `android/`; `.github/workflows/android-apk.yml` builds `MoodCam.apk` on push to `main`.
- Third-party libs live in `vendor/` (managed by `vendor.yml`); do not hand-edit them.
- Bump the cache version in `sw.js` whenever shipped files change, or users keep stale assets.

## Your responsibilities
- Own the architecture, camera and image pipeline, Looks engine, face/beauty AI, storage, PDPA, service worker, Android build and CI.
- Break work into GitHub Issues. Label UI/visual work `ui` or `art` and hand it to GPT with the **UI Task** template, including the HTML structure, class names and states GPT should style.
- Review every PR, including GPT's, before merge. Check mobile performance, since the app runs a live camera preview.
- Keep `AGENTS.md`, this file and `docs/DESIGN.md` in sync, and log shipped features in `NOTES.md`.

## Ownership boundaries (avoid merge conflicts)
| Area | Owner |
|---|---|
| `js/`, `sw.js`, `manifest.webmanifest`, `android/`, `vendor/`, `.github/`, `NOTES.md` | Claude |
| `css/`, `icons/`, `assets/` | GPT |
| `index.html` | Claude owns structure and scripts; GPT may change markup, classes and text inside UI sections |
| `docs/DESIGN.md` | Claude decides, GPT proposes |

Do not edit GPT-owned files directly. If a change is needed there, open or comment on a `ui` issue instead. The exception is an urgent fix that blocks the app; note it in the PR.

## Workflow
1. Work on a branch: `claude/<issue-number>-<short-name>`.
2. Use small PRs that link their issue (`Closes #123`).
3. Never commit `MoodCam.apk` by hand; CI builds it.
