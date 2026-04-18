# PDF Read Aloud

Next.js 15 web app. Upload a PDF, extract its text, and hear it read aloud with **word-by-word synchronized highlighting** using Microsoft Edge's neural TTS voices.

## Stack

- Next.js 15 (App Router, TypeScript, strict mode)
- Tailwind CSS
- `pdfjs-dist` — PDF rendering + text extraction on the client
- `msedge-tts` — server-side wrapper for Edge's TTS service (Node runtime)

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. No env vars required — see `.env.example`.

## Features

- Drag-and-drop PDF upload (max 20MB)
- Two-panel layout: PDF canvas preview (left) + extracted text with live highlighting (right)
- Voice picker grouped by locale (20+ neural voices, English prioritized; Bengali, Hindi, French, German, Spanish, Japanese, Chinese, Korean included)
- Speed control: 0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x — passed to the TTS service so word boundary timings stay accurate
- Play / Pause / Stop + progress bar
- Word-by-word highlight follows audio playback; active word auto-scrolls into view
- Keyboard shortcuts: **Space** = play/pause · **←/→** = prev/next page
- Dark-mode ready (Tailwind `dark:` classes; toggles with system theme)

## Architecture

### API routes

- `POST /api/tts` — body `{ text, voice, rate? }`, returns `{ audio: base64, boundaries: WordBoundary[] }`. Uses `msedge-tts` with `wordBoundaryEnabled`. Microsoft offsets are HNS (100-ns ticks) and are converted to ms by `/ 10000`. `runtime = 'nodejs'` (edge runtime is incompatible with `msedge-tts`'s WebSocket client).
- `GET /api/voices` — returns the curated voice list.

### Client

- `app/page.tsx` — orchestrates upload, page state, playback.
- `components/PdfViewer.tsx` — dynamically imports `pdfjs-dist`, renders the current page to canvas, and extracts text for every page once the file is loaded. Worker loaded from cdnjs matching the installed pdfjs version.
- `components/TextPanel.tsx` — renders words as `<span>`s; active word is highlighted and scrolled into view via `scrollIntoView`.
- `hooks/useTtsPlayer.ts` — owns the `<audio>` element, blob URL lifecycle, and `currentWordIndex` derivation from `timeupdate`.
- `lib/alignBoundaries.ts` — two-pointer alignment between TTS word boundaries and rendered words (handles punctuation, contractions, hyphenation drift).

### Tricky bits (commented in source)

- **HNS → ms:** `offsetMs = Offset / 10_000`
- **PDF.js worker:** `GlobalWorkerOptions.workerSrc` points at cdnjs with `pdfjs.version`
- **Boundary alignment:** TTS tokens don't match whitespace-split words 1:1; `alignBoundaries` walks both arrays, normalizing (lowercase, strip punctuation), interpolating when one boundary covers multiple rendered words
- **Speed:** `rate` is sent to the TTS API (e.g. `"+50%"` for 1.5x) so Microsoft generates audio + boundaries at the chosen speed — more accurate than client-side `playbackRate`

## Limits

- No OCR — scanned/image PDFs will show "No text found"
- PDFs are processed in memory; never persisted server-side
- No auth, no database
