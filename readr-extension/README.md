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

Set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in `.env.local` to use OpenRouter for
article summaries and chat. `NVIDIA_API_KEY` is optional and provides a fallback if the
OpenRouter request fails. NVIDIA is used directly when OpenRouter is not fully configured.

Set `EDGE_TTS_API_URL=http://localhost:3001/api/tts` for read-aloud during local development.
The Next.js web app at the repository root must remain running on port `3001` while using
read-aloud:

```sh
# Run from the repository root in a separate terminal
npm install
cp .env.example .env.local
npm run dev
```

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
- Rebuild after changing `.env.local` because provider settings and API keys are inlined at
  build time. Keys bundled in a browser extension can be inspected by its users.
- TL;DR results and the latest 10 chat turns are stored per article URL in IndexedDB. The
  **New chat** action deletes the current article's conversation without removing its summary.
- There are no configured test, lint, format, or typecheck scripts.
