# Output: Replace Clerk with apps/auth

Plan: `.claude/plans/replace-clerk-with-apps-auth.md`

## Result

Clerk removed from `apps/web`. Sign-up, sign-in, sign-out now go through
`apps/auth` (Better Auth, email + password, libSQL/Turso).

## Verification

- `apps/auth`: 43 tests pass (was 40), typecheck, lint, build clean.
- `apps/web`: typecheck, lint clean.
- Live run (auth :3010 on `file:` libSQL, web :3011):
  - curl: sign-up 200 with `set-auth-token` exposed via CORS, no `set-cookie`;
    sign-in 200; JWE minted (5 parts); `/api/me` returns user; 401 without
    token and on wrong password.
  - web routes: 401 with no token or garbage token; past the guard with a
    valid JWE.
  - Chrome: sign-up via UI, token in localStorage, sign-out clears it,
    wrong password shows error, sign-in restores session; `/api/list-pdfs`
    went 401 -> 500 (500 = Supabase project unreachable, pre-existing).

## Bugs found during the live run

- libSQL does not create a missing parent dir for `file:` URLs
  (SQLITE_CANTOPEN 14). Restored `mkdirSync`; regression test added.
- A module-level 401 `Response` would fail on reuse (single-use body).
  Replaced with a factory.

## Not done / open

- Real Turso instance untested: needs `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`.
- Supabase project unreachable (DNS fails) — app data routes return 500.
- No password reset or email verification (no email transport).
- Port 3000 is taken locally by another project.
- `file:` database URLs resolve against cwd, not `apps/auth/`.
