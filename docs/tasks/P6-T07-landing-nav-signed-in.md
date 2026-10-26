# P6-T07 — Landing nav knows you're signed in

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | B |
| Needs first | — |
| Files allowed | `apps/web/components/landing/Nav.tsx`, `apps/web/components/landing/Hero.tsx` (CTA only), `apps/web/app/page.tsx` (to pass sign-in state, if needed), `apps/web/components/landing/Pricing.tsx` (CTAs only: signed in → Free "Go to dashboard", Pro "Upgrade to Pro" → `/dashboard/billing`; added in review), plus co-located tests |
| project.md | §6.1 Landing page, §6.2 Auth |

## Why
The product owner reports that after signing in, the landing page still shows "Sign in" (2026-10-26). The landing `Nav` was built static, so it shows **Sign in** and **Start free** to everyone. The landing page renders per request now (P6-T03), and `/` runs through Clerk's middleware (`proxy.ts`), so it can know who's signed in.

## Steps
1. **Signed in:** the nav shows **Dashboard** (→ `/dashboard`) instead of **Sign in** / **Start free**. The Hero's "Start free" CTA becomes "Go to dashboard".
2. **Signed out:** unchanged.
3. Read the sign-in state on the server, with Clerk's `auth()` in the page or a server component, so there's no flash of the wrong button. If you use Clerk's client components instead, explain why in the PR.
4. Don't change the page's look beyond those labels and links.
5. Tests: signed-out shows Sign in and Start free; signed-in shows Dashboard.

## Done when
- [ ] On a Vercel preview, signed in: the landing nav shows Dashboard, and the Hero CTA goes to the dashboard
- [ ] Signed out: unchanged
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- UI only. CodeRabbit is optional unless you touch auth middleware, which you shouldn't need to.
