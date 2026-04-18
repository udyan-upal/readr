Here's a comprehensive prompt you can drop into Claude Code:

---

# Build a PDF Reader with Word-Synced Text-to-Speech (Next.js)

## Project Overview

Build a Next.js 15 web application (App Router) that lets users upload a PDF, extracts its text, and reads it aloud using Microsoft Edge's TTS service with **word-by-word synchronized highlighting** — similar to Microsoft Edge's built-in "Read Aloud" PDF feature.

## Tech Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **PDF parsing:** `pdfjs-dist` (Mozilla's PDF.js) — for both rendering and text extraction on the client
- **TTS:** `msedge-tts` npm package (server-side only — runs in Next.js API route)
- **Audio playback:** Native HTML5 `<audio>` element
- **State management:** React hooks (useState, useRef, useEffect) — no Redux/Zustand needed
- **Package manager:** npm

## Core Features

1. **PDF upload** — drag-and-drop or file picker, max 20MB, PDF only
2. **PDF rendering** — render pages visually using PDF.js canvas (like a real PDF viewer)
3. **Text extraction** — extract text per page with position metadata, so we know which word is where
4. **Voice selection** — dropdown of Edge's neural voices (English voices prioritized: Aria, Guy, Jenny, Davis, Emma, Brian, plus a few non-English like Bengali `bn-BD-NabanitaNeural`, `bn-BD-PradeepNeural`)
5. **Playback controls** — Play / Pause / Stop, speed selector (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)
6. **Word-by-word highlighting** — as audio plays, highlight the currently-spoken word in the text panel
7. **Auto-scroll** — keep the highlighted word in view
8. **Page-by-page processing** — synthesize audio one page at a time so user doesn't wait for entire long PDF
9. **Two-panel layout** — left: PDF canvas preview, right: extracted text with live highlighting

## Architecture

### Backend (Next.js API Route)

**File:** `app/api/tts/route.ts`

- POST endpoint accepting `{ text: string, voice: string, rate?: string }`
- Uses `msedge-tts` with `wordBoundaryEnabled: true`
- Collects audio stream into a Buffer
- Collects word boundary metadata from the metadata stream
- Returns JSON: `{ audio: base64String, boundaries: WordBoundary[] }`
- `WordBoundary` shape: `{ text: string, offsetMs: number, durationMs: number }`
- Convert Microsoft's HNS units (100-nanosecond) to milliseconds by dividing offset/duration by 10,000
- Handle errors gracefully (voice not found, empty text, service timeout)
- Set `runtime = 'nodejs'` (NOT edge runtime — msedge-tts needs Node WebSocket)

**File:** `app/api/voices/route.ts`

- GET endpoint that returns the curated list of voices. Hardcode a JSON list — no need to fetch from Microsoft every time. Include at minimum: name, shortName (e.g., `en-US-AriaNeural`), gender, locale, friendlyName.

### Frontend

**File:** `app/page.tsx` — main page with two-panel layout

**Components to create under `components/`:**

1. **`PdfUploader.tsx`** — drag-and-drop zone, handles file validation (PDF only, ≤20MB), passes File up via callback
2. **`PdfViewer.tsx`** — renders PDF pages to canvas using `pdfjs-dist`. Props: `file: File | null`, `currentPage: number`, `onPageChange`, `onTextExtracted(pages: PageText[])`. Show page navigation (prev/next/jump).
3. **`TextPanel.tsx`** — displays extracted text of current page as an array of `<span>` elements, one per word. Props: `words: Word[]`, `currentWordIndex: number`. The active word gets a yellow/highlighted background and the ref-based auto-scroll keeps it in view.
4. **`PlayerControls.tsx`** — play/pause/stop buttons, voice dropdown, speed selector, progress bar. Props: all playback state + callbacks.
5. **`VoiceSelector.tsx`** — dropdown, grouped by locale, showing friendly names.

**File:** `hooks/useTtsPlayer.ts` — custom hook encapsulating:

- Current audio element ref
- Audio Blob URL management (create/revoke)
- Boundaries state
- `currentWordIndex` derived from `audio.currentTime` via `timeupdate` listener
- Methods: `play(text, voice, rate)`, `pause()`, `resume()`, `stop()`, `setSpeed(rate)`
- When `play` is called: fetch `/api/tts`, decode base64 to Blob, set as audio source, auto-play
- Cleanup on unmount (revoke blob URLs, pause audio)

### Data Types

Define in `types/index.ts`:

```ts
export interface Word {
  text: string;
  index: number; // global index within page
  offsetMs?: number; // populated after TTS response
  durationMs?: number;
}

export interface WordBoundary {
  text: string;
  offsetMs: number;
  durationMs: number;
}

export interface PageText {
  pageNumber: number;
  text: string;
  words: Word[];
}

export interface Voice {
  shortName: string; // "en-US-AriaNeural"
  friendlyName: string; // "Microsoft Aria Online (Natural) - English (United States)"
  gender: "Male" | "Female";
  locale: string; // "en-US"
}
```

## Critical Implementation Details

### PDF.js worker setup

Next.js needs the PDF.js worker configured correctly. In the PdfViewer component:

```ts
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
```

Or copy the worker to `public/` and reference it locally.

### Text extraction with word positions

Use `page.getTextContent()` from PDF.js. Split each text item by whitespace into words, preserving order. Store as `Word[]` with sequential `index`.

### Matching TTS word boundaries to rendered words

**This is the hardest part.** Microsoft's word boundaries don't always align 1:1 with your split-by-whitespace words (punctuation, contractions, hyphenation). Strategy:

- After receiving boundaries from the API, walk through both arrays with a two-pointer approach
- Match by normalized text (lowercase, strip punctuation)
- If a TTS boundary contains multiple rendered words (e.g., "hello," vs "hello"), attach the timing to the first match and interpolate if needed
- Log mismatches to console for debugging but don't crash

Write this as a helper function `alignBoundaries(renderedWords: Word[], boundaries: WordBoundary[]): Word[]`.

### Playback with speed adjustment

When user changes playback speed, set `audioRef.current.playbackRate = speed`. Word boundary timings are in "natural speed" milliseconds, so divide `currentTime` by `playbackRate`... **wait, no** — `audio.currentTime` already reflects real elapsed audio time regardless of playback rate, so boundaries match directly. Test this carefully.

**Better approach:** pass `rate` to the TTS API (e.g., `+50%` for 1.5x) so Microsoft generates audio at that speed AND returns adjusted boundaries. This is more accurate than client-side `playbackRate`.

### Auto-scroll

In `TextPanel`, use `useRef` array for word spans. When `currentWordIndex` changes, call `spans[currentWordIndex].scrollIntoView({ behavior: 'smooth', block: 'center' })` throttled to avoid janky scrolling.

### UI / Styling

- Clean, minimal design inspired by Microsoft Edge's reader mode
- Two-panel layout: 50/50 split on desktop, stacked on mobile
- Sticky playback controls at bottom
- Highlighted word: `bg-yellow-200 dark:bg-yellow-800 rounded px-0.5` with smooth transition
- Already-read words: slightly dimmed (`text-gray-400`)
- Unread words: normal
- Dark mode support via Tailwind's `dark:` variants

## Edge Cases to Handle

- Empty PDF / PDF with no extractable text (scanned image PDFs) — show message "No text found, OCR not supported"
- Network failure during TTS call — retry button
- User uploads new PDF mid-playback — stop current audio
- Very long page (>5000 chars) — chunk into sentences and synthesize sequentially
- Special characters / non-English text — make sure voice locale matches

## Deliverables

1. Fully working Next.js 15 app
2. `README.md` with setup instructions (`npm install`, `npm run dev`)
3. `.env.example` (even if no env vars needed, so user knows)
4. Sensible default: load with English voices, "Aria" selected
5. No hardcoded paths; use relative paths everywhere
6. TypeScript strict mode on
7. ESLint passing
8. Comments on the tricky parts (boundary alignment, PDF.js worker, HNS unit conversion)

## Do NOT

- Do not use the Web Speech API's `SpeechSynthesis` as a fallback — we specifically want Edge's neural voices via `msedge-tts`
- Do not implement OCR
- Do not store PDFs on the server — process in memory only, discard after response
- Do not use `pdf-parse` — we need PDF.js for visual rendering too, so one library for both
- Do not add authentication or user accounts
- Do not add a database

## Nice-to-haves (implement only if time permits)

- Keyboard shortcuts: Space to play/pause, arrow keys for page navigation
- Download the synthesized audio as MP3
- Export transcript with timestamps (SRT subtitle file)
- Sentence-level highlighting (in addition to word-level, lighter background)

---

Start by scaffolding the Next.js project, installing dependencies (`msedge-tts`, `pdfjs-dist`, plus UI deps), then build the API route first (test with `curl`), then the frontend. Build incrementally — get basic PDF upload + render working before touching TTS.

---

That's the full prompt. A few things you might want to tweak before running it:

- The `bn-BD` Bengali voices — double-check those short-names exist in the current Edge voice list. If they don't, the API call will fail silently for that locale.
- If you want a simpler first version, remove the two-panel PDF rendering and just show extracted text. Cuts the complexity in half.

