# AGENTS.md

## Commands
- Use Bun; `bun.lock` is the lockfile and `package.json` scripts call Bun directly.
- Build with `bun run build`; this bundles JS and copies static assets into `dist/`.
- Dev watch is `bun run dev`, which runs `bun --watch run build.ts`.
- There are no configured test, lint, format, or typecheck scripts in this repo.

## Extension Flow
- This is a Chrome MV3 extension; load the unpacked extension from `dist/` after building.
- `manifest.json` is the source manifest and is copied to `dist/manifest.json` during build.
- Popup entrypoint: `src/popup/popup.js`; it injects `content/extractor.js` into the active tab with `chrome.scripting.executeScript`.
- Content entrypoint: `src/content/extractor.js`; it uses `@mozilla/readability` and sends `ARTICLE_EXTRACTED` to the background worker.
- Background entrypoint: `src/background/service_worker.js`; it writes `pendingArticle`/`pendingError` to `chrome.storage.session` and opens `reader/index.html` in a new tab.
- Reader entrypoint: `src/reader/reader.js`; it reads article data from `chrome.storage.session` and settings/annotations from `chrome.storage.local`.

## Build Gotchas
- `build.ts` is the source of truth for bundled entrypoints and copied files; update it when adding new JS/CSS/HTML assets that must reach `dist/`.
- Do not hand-edit generated `dist/` files for source changes; edit `src/`, `manifest.json`, or `icons/` and rebuild.
- The build copies `icons/readr.png` and `icons/readr-nobg.png`; extension icons are resized from `icons/readr.png` using macOS `sips`, while the reader header uses `readr-nobg.png`.

## Environment
- `.env.example` documents `NVIDIA_API_KEY`; `.env.local` is gitignored and may contain the real key.
- `build.ts` inlines `process.env.NVIDIA_API_KEY` as `__NVIDIA_API_KEY__`; rebuilding is required after changing the key.
- If `NVIDIA_API_KEY` is absent, `bun run build` only warns, but the reader tl;dr API call will fail at runtime.
