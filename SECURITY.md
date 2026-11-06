# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
([private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).

Include what you found, how to reproduce it, and the impact. You'll get a reply as soon as
possible; this is a personal project, so please allow a few days.

## Supported versions

Only the latest commit on `main` gets fixes.

## Notes for self-hosters

- **Never commit `.env.local` files.** They are git-ignored; keep it that way.
- **The extension bundles its config.** Values in `apps/extension/.env.local`
  (`OPENROUTER_API_KEY`, `NVIDIA_API_KEY`, `EDGE_TTS_API_TOKEN`) are written into the built
  JavaScript. Anyone with your built extension can read them. Keep your build to yourself, and
  don't publish it to a store with your keys inside.
- **Set web app secrets as Worker secrets** (`wrangler secret put`), not in committed files.
- Rotate `EXT_API_TOKEN` and `AUTH_SECRET` if you think they leaked.
