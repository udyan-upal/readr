# AGENTS.md

This repository is a pnpm workspace containing the Readr web app, its Chrome extension,
and shared packages. The extension lives in `apps/extension/` and has its own
`AGENTS.md` with more specific guidance.

## Working agreements

- Never commit, amend, or push unless the user explicitly asks for it in the current
  request. Finish work by leaving changes in the working tree for review.
- When asked to commit, follow Conventional Commits; commit bodies must wrap at 100
  characters (commitlint enforces this).


## Repository layout

| Path | Project | Tooling |
|------|---------|---------|
| `apps/web/` | PDF reader web app | Next.js, pnpm |
| `apps/auth/` | Auth API service | Hono, tsx, Drizzle |
| `apps/extension/` | Article reader Chrome extension | Chrome MV3, Bun (build only) |
| `packages/{shared,logger,telemetry,validation}/` | Shared libraries | TypeScript, tsc |
| `tools/{tsconfig,biome}/` | Shared configs | — |

Dependencies install once at the repo root (`pnpm install`); workspace packages resolve
each other via `workspace:*`. The extension's dependencies come from the root install,
but its build still runs under Bun.

## Commands

### From the repo root

```bash
pnpm install          # install all workspaces
pnpm run dev          # auth (:3000) + readr (:3030) via concurrently
pnpm run build        # build:packages then build:apps
pnpm run lint         # biome check across workspaces
pnpm run typeCheck    # tsc --noEmit across workspaces
pnpm run test         # vitest (apps/auth)
```

### Web app

```bash
pnpm --filter @readr/web run dev        # dev server on port 3030
pnpm --filter @readr/web run build      # production build
pnpm --filter @readr/web run lint       # biome check
pnpm --filter @readr/web run typeCheck  # tsc --noEmit
```

### Chrome extension

Run these from `apps/extension/`:

```bash
bun run dev      # rebuild on source changes
bun run build    # build the unpacked extension into dist/
```

Load `apps/extension/dist/` as an unpacked extension in Chrome after building.
The web app and auth have no readr test suite (auth does); the extension also has no
configured lint or type-check command.

## Web app environment

Required in `apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

`msedge-tts` needs no API key — it uses Microsoft's public endpoint.

## Extension environment

`apps/extension/.env.local` may define `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and
`NVIDIA_API_KEY`; see `apps/extension/.env.example`. OpenRouter is primary and NVIDIA is
the fallback. The build inlines provider configuration into the extension bundle, so
rebuild after changing it. The build succeeds without a provider, but summary and chat
requests fail at runtime.

## Web app architecture

**Stack:** Next.js 15 App Router · TypeScript strict · Tailwind CSS · Clerk (auth) · Supabase (storage + DB) · `pdfjs-dist` (client) · `msedge-tts` (server)

### Data flow

1. User uploads/opens a PDF → `PdfViewer` renders pages to canvas via PDF.js and extracts `Word[]` with pixel positions per page.
2. Play is triggered → `useTtsPlayer` splits the page's words into progressive clips
   (`lib/ttsChunks.ts`, 100 → 500 → 1000 → 1500 chars, same strategy as the extension) and
   calls `POST /api/tts` per clip. `lib/ttsBuffer.ts` keeps the current clip plus two ahead,
   with at most two fetches in flight, so audio starts after the first short clip instead of
   the whole page. `lib/alignBoundaries.ts` maps TTS boundaries onto the extracted `Word[]`
   (TTS tokens ≠ whitespace-split words — normalization + two-pointer walk).
3. Audio plays; `timeupdate` fires → `currentWordIndex` is derived from `audio.currentTime` vs boundary offsets → the corresponding word span is highlighted and scrolled into view in `PdfViewer`.
4. At ~60% of a page, `useTtsPlayer.prefetch` fetches the next page's first (tiny) clip and
   preloads its `<audio>` element. On the last chunk's end it swaps to that clip gaplessly;
   otherwise the page layer calls `play` for the next page.

### Key files

| File | Role |
|------|------|
| `app/page.tsx` | Root orchestrator: PDF state, notes state, TTS wiring, session persistence |
| `components/PdfViewer.tsx` | PDF.js rendering + text layer + word highlight overlay + per-line note editor (popover uses `position: fixed` computed from `getBoundingClientRect`) |
| `components/NotesPanel.tsx` | Right-side panel listing all notes across all pages; navigate-to-page + flash highlight |
| `components/PdfOutline.tsx` | Table of contents sidebar |
| `hooks/useTtsPlayer.ts` | All audio logic: progressive clip buffer, cross-page prefetch swap, word index derivation |
| `lib/ttsChunks.ts` | Splits page words into 100 → 500 → 1000 → 1500 char clips |
| `lib/ttsBuffer.ts` | Look-ahead buffer: current clip + two ahead, max two fetches in flight |
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

## Extension architecture

The Chrome MV3 extension extracts readable article content from the active tab and opens it
in a dedicated reader tab.

1. `apps/extension/src/popup/popup.js` injects the content extractor into the active tab.
2. `apps/extension/src/content/extractor.js` uses `@mozilla/readability` and sends an
   `ARTICLE_EXTRACTED` message.
3. `apps/extension/src/background/service_worker.js` stores the article or error in
   `chrome.storage.session` and opens the reader.
4. `apps/extension/src/reader/reader.js` renders the article, persists settings and
   annotations in `chrome.storage.local`, and stores per-article summaries and chat history
   in IndexedDB.

`apps/extension/build.ts` is the source of truth for bundled entrypoints and copied assets.
Do not edit generated files in `apps/extension/dist/`; edit `src/`, `manifest.json`, or
`icons/` and rebuild instead.
