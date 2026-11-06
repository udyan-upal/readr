# Open-source readiness (v1)

Decisions: MIT license · revoke leaked NVIDIA key + purge it from history · repo stays private (owner flips it).

1. Add LICENSE (MIT), CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, issue/PR templates. → verify: files exist, links resolve.
2. README: fix stale setup (Clerk/Supabase/npm → pnpm, Cloudflare D1/R2, single-user login), add self-hosting
   steps, unofficial Edge TTS disclaimer, current chunk sizes, license/contributing links. → verify: commands match package.json scripts.
3. Untrack `.claude/settings.local.json` (personal), ignore it; note fork-specific IDs in wrangler.jsonc. → verify: git status.
4. Commit + push (scope `repo`).
5. Purge `nvapi-…` from history: bundle backup, `git filter-repo --replace-text`, force-push main. → verify: history grep finds 0 hits.
