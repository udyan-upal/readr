# Output: TTS smaller chunks + background retry

Plan: `.claude/plans/tts-smaller-chunks-retry-v1.md`

## Changes
- `apps/extension/src/reader/tts-buffer.mjs`, `apps/web/lib/ttsChunks.ts`: chunk targets `[100, 250, 400]`.
- `apps/extension/src/reader/tts-buffer.mjs`, `apps/web/lib/ttsBuffer.ts`: look-ahead 4 clips, 2 concurrent;
  retry `retryable` errors with 500/1000/2000/4000ms backoff, cancelled on close.
- `apps/extension/src/reader/reader.js`, `apps/web/hooks/useTtsPlayer.ts`: mark 5xx/429/network errors retryable.
- `apps/extension/tests/tts-buffer.test.mjs`: updated targets + look-ahead; added retry/give-up/cancel tests.

## Verification
- Extension: `node --test tests/*.test.mjs` → 28/28 pass. `bun run build` OK.
- Web: `tsc --noEmit` clean, biome clean, tsx sanity run of TtsBuffer retry + non-retryable path.
- Web needs redeploy to the Worker to take effect.
