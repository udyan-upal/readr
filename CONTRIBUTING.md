# Contributing to Readr

Thanks for helping out! Bug reports, fixes, and features are all welcome.

## Before you start

- **Bugs:** open an issue with steps to reproduce. Search existing issues first.
- **Features or bigger changes:** open an issue to discuss before writing code, so your work
  fits the project's direction.
- **Security problems:** do not open a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

Requirements: Node.js 24 (see `.nvmrc`), [pnpm](https://pnpm.io) 11, and [Bun](https://bun.sh)
for the extension build.

```bash
git clone https://github.com/<you>/readr.git
cd readr
pnpm install

# Web app (http://localhost:3030)
cp apps/web/.env.example apps/web/.env.local   # fill in the placeholders
pnpm --filter @readr/web dev

# Extension (second terminal)
cp apps/extension/.env.example apps/extension/.env.local
cd apps/extension && bun run dev               # load apps/extension/dist/ unpacked in Chrome
```

See the [README](README.md#run-it-locally) for details.

## Repository layout

| Path | What it is |
|---|---|
| `apps/web` | Next.js web app + API (`/api/tts`, PDFs, notes), deployed to Cloudflare Workers |
| `apps/extension` | Chrome MV3 extension (plain JS, bundled with Bun) |
| `apps/auth` | Standalone Better Auth service (not used by the deployed web app) |
| `packages/*` | Shared ESM packages (`shared`, `logger`, `telemetry`, `validation`) |
| `tools/*` | Shared Biome and TypeScript configs |

## Making a change

1. Fork the repo and create a branch: `feat/<short-name>`, `fix/<short-name>`, or `chore/<short-name>`.
2. Keep the change focused. Unrelated refactors belong in their own PR.
3. Match the existing style. Biome formats and lints on commit; run it yourself with
   `pnpm run lint:fix`.
4. Check your work:
   ```bash
   pnpm run typeCheck
   pnpm run test
   node --test apps/extension/tests/*.test.mjs   # extension tests
   ```
5. For UI changes, include a screenshot or short clip in the PR.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org) and are checked by
commitlint. The scope is required to be one of:

`web`, `extension`, `readr` (both apps), `api`, `auth`, `shared`, `logger`, `validation`,
`tsconfig`, `biome`, `repo`

```
fix(extension): keep the listen button in sync after a seek
feat(web): add a sleep timer to the player
```

## Pull requests

- Fill in the PR template and link the issue it closes.
- CI must pass (type check + tests).
- A maintainer reviews it; expect some back and forth. Small PRs get merged faster.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE)
and that you'll follow the [Code of Conduct](CODE_OF_CONDUCT.md).
