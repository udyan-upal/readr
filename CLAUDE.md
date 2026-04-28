# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server on port 3001
npm run build    # production build
npm run lint     # ESLint
npx tsc --noEmit # type-check without emitting
```

No test suite exists.

## Environment

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

`msedge-tts` needs no API key — it uses Microsoft's public endpoint.

## Architecture

**Stack:** Next.js 15 App Router · TypeScript strict · Tailwind CSS · Clerk (auth) · Supabase (storage + DB) · `pdfjs-dist` (client) · `msedge-tts` (server)

### Data flow

1. User uploads/opens a PDF → `PdfViewer` renders pages to canvas via PDF.js and extracts `Word[]` with pixel positions per page.
2. Play is triggered → `useTtsPlayer` calls `POST /api/tts` with the page text, voice, and rate. The API returns `{ audio: base64, boundaries: WordBoundary[] }`. `lib/alignBoundaries.ts` maps TTS boundaries onto the extracted `Word[]` (TTS tokens ≠ whitespace-split words — normalization + two-pointer walk).
3. Audio plays; `timeupdate` fires → `currentWordIndex` is derived from `audio.currentTime` vs boundary offsets → the corresponding word span is highlighted and scrolled into view in `PdfViewer`.
4. At ~60% of a page, the next page is prefetched (gapless playback ping-pong via two `<audio>` elements in `useTtsPlayer`).

### Key files

| File | Role |
|------|------|
| `app/page.tsx` | Root orchestrator: PDF state, notes state, TTS wiring, session persistence |
| `components/PdfViewer.tsx` | PDF.js rendering + text layer + word highlight overlay + per-line note editor (popover uses `position: fixed` computed from `getBoundingClientRect`) |
| `components/NotesPanel.tsx` | Right-side panel listing all notes across all pages; navigate-to-page + flash highlight |
| `components/PdfOutline.tsx` | Table of contents sidebar |
| `hooks/useTtsPlayer.ts` | All audio logic: blob URL lifecycle, gapless ping-pong, word index derivation |
| `lib/alignBoundaries.ts` | TTS boundary ↔ word array alignment |
| `lib/voices.ts` | Static voice list (`VOICES`, `DEFAULT_VOICE`) |
| `utils/supabase/admin.ts` | Service-role Supabase client (API routes only) |

### API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/tts` | POST | `{ text, voice, rate }` → `{ audio: base64, boundaries[] }`. `runtime = "nodejs"` (msedge-tts needs Node WebSocket) |
| `/api/voices` | GET | Returns voice list from `lib/voices.ts` |
| `/api/upload-pdf` | POST | Uploads PDF to Supabase Storage under `pdfs/{userId}/` |
| `/api/list-pdfs` | GET | Lists user's PDFs from Storage + joins `reading_sessions` |
| `/api/notes` | GET/POST/PATCH/DELETE | Per-PDF notes in `pdf_notes` table. GET without `page` param returns all notes for a PDF; with `page` returns page-specific notes |
| `/api/session` | POST | Upserts `reading_sessions` (last page, word index, voice, rate) |

### Supabase schema (inferred)

- `pdf_notes`: `id, user_id, pdf_path, page_number, note_text, line_y, word_index, created_at`
- `reading_sessions`: `user_id, pdf_path, pdf_name, current_page, word_index, voice, rate, updated_at`
- Storage bucket: `pdfs` — files stored at `{userId}/{timestamp}-{filename}`

### Tricky bits

- **PDF.js worker:** `GlobalWorkerOptions.workerSrc` points at cdnjs matching `pdfjs.version`. `canvas` is aliased to `false` in webpack config to avoid server-side canvas dependency.
- **`msedge-tts` bundling:** must be in `serverExternalPackages` in `next.config.mjs` — webpack bundling breaks its internal WebSocket handshake.
- **HNS → ms:** Microsoft boundary offsets are in 100-ns ticks; divide by `10_000` for ms.
- **Speed:** `rate` (e.g. `"+50%"`) is sent to the TTS API so Microsoft generates audio + boundaries at the chosen speed. Client-side `playbackRate` is NOT used.
- **Note popover positioning:** uses `position: fixed` derived from `pageContainerRef.getBoundingClientRect()` to escape the PDF canvas stacking context and avoid overlapping the sidebar.
- **All routes use `export const runtime = "nodejs"`** — edge runtime is incompatible with `msedge-tts`.
