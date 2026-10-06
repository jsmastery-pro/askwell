# P1-T05 — Clerk auth pages + middleware

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | B |
| Needs first | none |
| Files allowed | `apps/web/middleware.ts`, `apps/web/app/(auth)/**`, `apps/web/app/layout.tsx` |
| project.md | §6.2 Auth |

## Goal
Sign in / sign up, and middleware protecting `/dashboard/*` and the owner API routes. Google OAuth is already enabled in the Clerk dashboard — no extra setup needed for it.

## Steps
1. Install `@clerk/nextjs`. Wrap the root layout in `<ClerkProvider>`.
2. Add `/sign-in` and `/sign-up` using Clerk's prebuilt `<SignIn />` / `<SignUp />`. Email+password and Google both show automatically.
3. Add `middleware.ts` with `clerkMiddleware`, protecting `/dashboard/*` and the owner routes listed in §8 (even though they don't exist yet — match the path prefix so they're covered once built).
4. Leave `/api/widget/*` and `/api/stripe/webhook` unauthenticated — exclude them from the matcher.
5. Signed-out visit to `/dashboard` → redirect to `/sign-in`. Signed-in → `/dashboard`.

## Done when
- [ ] `/sign-in` and `/sign-up` render with email+password and Google
- [ ] Signed-out visit to `/dashboard` redirects to `/sign-in`
- [ ] Sign-in redirects to `/dashboard`
- [ ] The middleware matcher covers the §8 owner routes and excludes `/api/widget/*` and `/api/stripe/webhook`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Don't create the `accounts` row here — that's P1-T06, after the schema (P1-T01) is in.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` should already be in your InstaCloud environment. If missing, stop and ask.
