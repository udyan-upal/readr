# TTS: smaller chunks + background retry (web + extension)

Cause: Worker on Cloudflare Free plan (10ms CPU) → `/api/tts` intermittently killed
(`error code: 1102`, surfaces as 503). One failed chunk ended the reading session.

1. Chunk targets `[100, 500, 1000, 1500]` → `[100, 250, 400]` (last repeats). Less CPU per
   request, cheaper retries. → verify: chunk tests updated.
2. TtsBuffer look-ahead 2 → 4 clips (≈1.5 min of audio buffered), still 2 fetches in flight,
   so fetching + retries happen while the current clip plays. → verify: lookahead test.
3. TtsBuffer retries errors flagged `retryable` (5xx/429/network) with backoff
   500/1000/2000/4000ms, abort-aware. Non-retryable (4xx) fails immediately. → verify: retry tests.
4. Fetchers (extension `fetchEdgeTtsClip`, web `fetchClip`) flag retryable errors.
