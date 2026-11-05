# PDF Read Aloud

Next.js 15 web app. Upload a PDF, extract its text, and hear it read aloud with **word-by-word synchronized highlighting** using Microsoft Edge's neural TTS voices.

## Screenshots

### Web app

![Readr web app showing a PDF with its sections sidebar and the read-aloud player](docs/screenshots/web-app.png)

### Chrome extension

![Readr extension showing an article in the distraction-free reader](docs/screenshots/extension.png)

## Stack

- Next.js 15 (App Router, TypeScript, strict mode)
- Tailwind CSS
- `pdfjs-dist` — PDF rendering + text extraction on the client
- `msedge-tts` — server-side wrapper for Edge's TTS service (Node runtime)

## Requirements

- Node.js and npm for the web app
- Bun for the Chrome extension
- A Clerk application
- A Supabase project with the required tables and `pdfs` storage bucket

## Run the Web App

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set the Clerk and Supabase credentials in `.env.local`, then open
[http://localhost:3030](http://localhost:3030).

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Microsoft Edge TTS uses a public endpoint, so it does not require an API key.

## Run the Chrome Extension

Keep the web app running because the extension sends read-aloud requests to its `/api/tts`
endpoint. In a second terminal:

```bash
cd apps/extension
bun install
cp .env.example .env.local
bun run dev
```

Configure `apps/extension/.env.local`:

```dotenv
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_MODEL=openai/gpt-4o-mini
NVIDIA_API_KEY=your-nvidia-api-key
EDGE_TTS_API_URL=http://localhost:3030/api/tts
```

OpenRouter is the primary summaries/chat provider. NVIDIA is optional and acts as a fallback.
The reader and read-aloud features still build without an AI provider, but summaries and chat
will fail at runtime.

Load the extension in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `apps/extension/dist/`.
5. Reload the extension from this page after a rebuild.

`bun run dev` watches source files and rebuilds `dist/`. Use `bun run build` for a one-time
build. Environment values are embedded at build time, so rebuild after editing
`apps/extension/.env.local`.

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

### System overview

```mermaid
flowchart LR
	subgraph Browser["Browser"]
		subgraph WebApp["Next.js web app"]
			UI["PdfViewer · PlayerControls<br/>NotesPanel · PdfOutline"]
			TTS["useTtsPlayer<br/>ttsBuffer · alignBoundaries"]
		end
		subgraph Extension["Chrome extension (MV3)"]
			Popup["popup.js"]
			Extractor["content/extractor.js<br/>Readability"]
			SW["background/service_worker.js"]
			Reader["reader.js"]
		end
		Local[("chrome.storage.local<br/>settings · annotations")]
		IDB[("IndexedDB<br/>per-article AI state")]
	end

	subgraph Cloudflare["Cloudflare (OpenNext)"]
		API["API routes<br/>tts · pdf · upload-pdf · list-pdfs<br/>notes · session · voices · login · me"]
		D1[("D1<br/>pdf_notes · reading_sessions")]
		R2[("R2 bucket<br/>PDFs")]
	end

	EdgeTTS["Microsoft Edge TTS"]
	OpenRouter["OpenRouter (primary)"]
	NVIDIA["NVIDIA (fallback)"]

	Popup -->|executeScript| Extractor
	Extractor -->|ARTICLE_EXTRACTED| SW
	SW -->|"storage.session + open reader tab"| Reader
	Reader --> Local
	Reader --> IDB
	Reader -->|"POST /api/tts"| API
	Reader -->|"tl;dr · Ask"| OpenRouter
	OpenRouter -.->|fallback| NVIDIA
	UI --> API
	TTS -->|"progressive clips"| API
	API --> EdgeTTS
	API --> D1
	API --> R2
```

The web app talks only to its own API routes. The extension is an independent MV3
bundle: it reuses the web app's `/api/tts` endpoint for read-aloud, calls the AI
providers directly, and keeps its own state in `chrome.storage` and IndexedDB.

### Read-aloud pipeline

```mermaid
sequenceDiagram
	autonumber
	participant V as PdfViewer
	participant P as useTtsPlayer
	participant B as ttsBuffer
	participant API as POST /api/tts
	participant E as Edge TTS
	participant A as alignBoundaries

	V->>P: Play with the page's extracted words
	P->>B: Split words into clips<br/>100 → 500 → 1000 → 1500 chars
	B->>API: Send clip, voice, rate
	API->>E: SSML with rate + wordBoundaryEnabled
	E-->>API: Audio + word boundaries (HNS ticks)
	API-->>B: base64 audio + boundaries in ms
	B-->>P: Current clip, two buffered ahead
	P->>A: Boundaries + rendered Word[]
	A-->>P: Aligned words
	P-->>V: currentWordIndex on timeupdate
	V->>V: Highlight word + scroll into view
	Note over P,B: Near 60% of a page, prefetch the next page's first clip
```

### Extension capture flow

```mermaid
flowchart TD
	Toolbar["Toolbar button"] --> Popup["popup.js<br/>tabs.query + scripting.executeScript"]
	Popup --> Extractor["content/extractor.js<br/>Mozilla Readability"]
	Extractor -->|ARTICLE_EXTRACTED| SW["service worker"]
	SW -->|"storage.session.set"| Store[("chrome.storage.session")]
	SW -->|"chrome.tabs.create"| Reader["reader/index.html + reader.js"]
	Store -->|"pendingArticle · pendingError"| Reader
	Reader --> Render["Render article + sections TOC"]
	Reader --> Listen["Listen → POST /api/tts"]
	Reader --> AI["tl;dr + Ask → OpenRouter, NVIDIA fallback"]
	Reader --> Settings[("chrome.storage.local<br/>theme · font · notes")]
	Reader --> Cache[("IndexedDB<br/>summaries · chat")]
```

### API routes

- `POST /api/tts` — body `{ text, voice, rate? }`, returns `{ audio: base64, boundaries: WordBoundary[] }`. Uses `msedge-tts` with `wordBoundaryEnabled`. Microsoft offsets are HNS (100-ns ticks) and are converted to ms by `/ 10000`. `runtime = 'nodejs'` (edge runtime is incompatible with `msedge-tts`'s WebSocket client).
- `GET /api/voices` — returns the curated voice list.

### Client

- `app/page.tsx` — orchestrates upload, page state, playback.
- `components/PdfViewer.tsx` — dynamically imports `pdfjs-dist`, renders the current page to canvas, and extracts text for every page once the file is loaded. Worker loaded from cdnjs matching the installed pdfjs version.
- `components/PlayerControls.tsx` — renders playback, voice, speed, and progress controls.
- `hooks/useTtsPlayer.ts` — owns the `<audio>` element, blob URL lifecycle, and `currentWordIndex` derivation from `timeupdate`.
- `lib/alignBoundaries.ts` — two-pointer alignment between TTS word boundaries and rendered words (handles punctuation, contractions, hyphenation drift).

### Tricky bits (commented in source)

- **HNS → ms:** `offsetMs = Offset / 10_000`
- **PDF.js worker:** `GlobalWorkerOptions.workerSrc` points at cdnjs with `pdfjs.version`
- **Boundary alignment:** TTS tokens don't match whitespace-split words 1:1; `alignBoundaries` walks both arrays, normalizing (lowercase, strip punctuation), interpolating when one boundary covers multiple rendered words
- **Speed:** `rate` is sent to the TTS API (e.g. `"+50%"` for 1.5x) so Microsoft generates audio + boundaries at the chosen speed — more accurate than client-side `playbackRate`

## Limits

- No OCR — scanned/image PDFs require OCR before their text can be read.
