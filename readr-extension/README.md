# readr

A Chrome MV3 extension that opens webpages in a distraction-free reader view.

## Requirements

- Bun
- macOS for the icon resize step in `bun run build`

## Setup

```sh
bun install
cp .env.example .env.local
```

Add `NVIDIA_API_KEY` to `.env.local` if you want the reader tl;dr feature to work.

## Commands

```sh
bun run build
bun run dev
```

`bun run build` bundles the extension into `dist/`. `bun run dev` watches and rebuilds with `bun --watch`.

## Load in Chrome

1. Run `bun run build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked** and select `dist/`.

## Project Structure

- `manifest.json` - source Chrome extension manifest
- `build.ts` - bundles JavaScript and copies static assets into `dist/`
- `src/popup/` - popup UI and active-tab script injection
- `src/content/` - article extraction with `@mozilla/readability`
- `src/background/` - service worker and session storage handoff
- `src/reader/` - reader view, settings, annotations, and tl;dr UI

## Notes

- `dist/` is generated build output and should not be edited by hand.
- Rebuild after changing `.env.local` because the API key is inlined at build time.
- There are no configured test, lint, format, or typecheck scripts.
