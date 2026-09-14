# Replace Clerk with `apps/auth` — one auth stack

Status: scoped, not started. Created 2026-09-09.

## Decisions locked

| Question | Answer | Consequence |
|---|---|---|
| Auth database | Keep Turso | Auth in Turso, app data in Supabase. `user_id` crosses DBs with no FK. |
| Sign-in methods | Email + password only | Google OAuth dropped. Passkey plugin stays loaded but unused. |
| Existing data | Dev only, safe to wipe | No id-mapping backfill. Truncate + re-upload. |

## Current state

**Two stacks.** `apps/web` (`@readr/web`, Next 3001) uses Clerk + Supabase.
`apps/auth` (`@boilerplate/auth`, Hono 3000) is unused boilerplate: Better Auth,
email+password, JWE bearer tokens, Turso.

**Why this is tractable:** `app/page.tsx` is `'use client'`. Every API call is a
client-side `fetch` (9 sites) hitting route handlers (4 files, 11 `auth()` calls).
No Server Component reads identity, so `apps/auth`'s bearer-only design fits
without relaxing it. Supabase is reached with the service-role key and gated
purely on `userId` — swapping the identity provider does not touch data access.

## Token flow after cutover

```
sign-in  -> POST /api/auth/sign-in/email      -> `set-auth-token` header = session token
mint     -> GET  /api/auth/token  (Bearer session) -> { token: "<5-part JWE>" }  ~15 min
API call -> fetch /api/*  with  Authorization: Bearer <JWE>
verify   -> web route handler decrypts the JWE locally with the shared key. No network.
```

Session token is the long-lived minting credential; the JWE is the short-lived
access token. Web holds the session token and re-mints on 401.

---

## Phase 1 — prepare `apps/auth`

1. **Lock CORS.** `auth.controller.ts:18` is bare `cors()` (origin `*`).
   Restrict to the web origin.
   → verify: cross-origin request from another origin is rejected.
2. **Expose the token headers.** CORS must set
   `Access-Control-Expose-Headers: set-auth-token, set-auth-jwt`, or browser JS
   cannot read them and sign-in silently yields no token.
   → verify: browser devtools shows `set-auth-token` readable from JS.
3. **Add `trustedOrigins`** to the `betterAuth()` config in `auth.service.ts`.
   → verify: existing 41 tests still pass.

## Phase 2 — swap the client (`apps/web`)

4. **Deps.** Remove `@clerk/nextjs`, add `better-auth` (for `createAuthClient`).
5. **Delete `middleware.ts`.** It only runs `clerkMiddleware()`; no gating lives
   there. Gating is in route handlers and the client.
6. **`app/layout.tsx`** — drop `<ClerkProvider>`.
7. **Build the auth client** — `lib/auth-client.ts`: `createAuthClient`, session
   token in `localStorage`, lazy JWE mint, re-mint on 401.
8. **`lib/api-fetch.ts`** — wrapper attaching `Authorization: Bearer <JWE>`.
   Repoint all 9 `fetch` sites in `app/page.tsx` (lines 148, 202, 213, 311, 522,
   530, 556, 589, 616).
9. **`lib/require-user.ts`** — server-side JWE verify with `jose.jwtDecrypt` and
   the shared `JWT_ENCRYPTION_KEY`; returns `userId` or 401. Replace all 11
   `const { userId } = await auth()` calls across `app/api/{session,notes,
   upload-pdf,list-pdfs}/route.ts`.
   → verify: each route returns 401 with no/invalid token, 200 with a valid one.
10. **Sign-in UI.** `<SignInButton mode="modal">` (page.tsx:704) becomes an own
    email+password form. `useUser()` (page.tsx:73) becomes `useSession()`.
    `<UserButton />` (page.tsx:791, 1145) becomes an own menu with sign-out.
    This is the bulk of the UI work — Clerk's hosted modal has no replacement.
11. **`.env.example`** — drop `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
    `CLERK_SECRET_KEY`; add `NEXT_PUBLIC_AUTH_URL` and `JWT_ENCRYPTION_KEY`
    (must byte-match `apps/auth`'s).

## Phase 3 — wipe and verify

12. Truncate `reading_sessions` and `pdf_notes`; empty the `pdfs` bucket.
13. Manual e2e with both services up: sign up -> upload -> add note -> reload
    (session restores) -> sign out -> confirm API returns 401.

## Phase 4 — remove Clerk

14. `pnpm remove @clerk/nextjs`, strip keys from `.env.local`, delete the Clerk
    dashboard application.
    → verify: `grep -ri clerk apps/` returns nothing outside the lockfile.

---

## Known gaps this creates

- **No password reset.** `apps/auth` wires no email sender. Email+password with
  no reset path means a forgotten password is unrecoverable. Fix later by
  configuring `sendResetPassword` with a real transport.
- **No email verification.** Any string that parses as an email can register.
- **`localStorage` token.** Readable by any injected script. `httpOnly` cookies
  would be safer, but `apps/auth` deliberately strips `set-cookie`
  (`auth.controller.ts:20`) to stay stateless. Accepted tradeoff of that design.
- **Two databases.** Users in Turso, their rows in Supabase. Deleting a user
  leaves orphaned `reading_sessions` / `pdf_notes` / storage objects. No FK can
  catch it — needs an explicit cleanup path.
- **Two services to run.** `apps/web` (3001) now depends on `apps/auth` (3000)
  being up. Auth down = nobody signs in.

## Risks

| Risk | Why | Mitigation |
|---|---|---|
| Token headers invisible to JS | CORS default hides non-safelisted response headers | Step 2, verify in browser before building UI |
| Key drift | `JWT_ENCRYPTION_KEY` must byte-match across both apps | Single source; verify decrypt in an integration test |
| Sign-in UI underestimated | Clerk's modal covers sign-up, sign-in, errors, loading | Budget it as the largest single task |

## Effort

Phase 1 small. Phase 2 is the work — step 10 (UI) and step 9 (11 call sites)
dominate. Roughly 1–1.5 days end to end.
