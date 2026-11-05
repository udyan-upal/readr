# Cloudflare deploy (v1)

Goal: run apps/web on Cloudflare Workers (free plan) with a single-user login, plus extension support.

1. Replace apps/auth dependency with `/api/login` (env ADMIN_USERNAME/ADMIN_PASSWORD) + HS256 JWT (AUTH_SECRET) -> verify: login/me curl OK
2. Add OpenNext Cloudflare adapter (`wrangler.jsonc`, `open-next.config.ts`, `cf:*` scripts) -> verify: `cf:build`, gzip < 3 MB
3. TTS: msedge-tts cannot connect on Workers -> native WebSocket path (`lib/edge-tts-worker.ts`) -> verify: valid MP3 + boundaries under `wrangler dev`
4. Lock `/api/tts`; extension sends `EDGE_TTS_API_TOKEN` == web `EXT_API_TOKEN` -> verify: extension tests
5. Deploy: set secrets, `pnpm --filter @readr/web cf:deploy`, rebuild extension with deployed URL

Open: Supabase project host no longer resolves in DNS (storage/notes/sessions dead) -> decide new Supabase vs D1/R2.
