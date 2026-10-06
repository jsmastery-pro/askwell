# P1-T04 — Landing page (static)

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | B |
| Needs first | none |
| Files allowed | `apps/web/app/page.tsx`, `apps/web/components/**` |
| project.md | §6.1 Landing page, §5 Plans |

## Goal
Replace the Phase 0 placeholder home page with the real static sections. No live widget yet — that's Phase 6.

## Steps
1. Build the sections: hero, how it works (3 steps), a static placeholder for the live-demo slot, pricing, install-snippet placeholder, footer.
2. Pricing table shows the numbers from §5.
3. `APP_NAME` from `packages/shared` everywhere — never hardcode "Askwell".
4. "Start free" CTA links to `/sign-up`.
5. Responsive with Tailwind. Reuse `apps/web/components` (e.g. `Container` from P0-T02).
6. One Vitest test for the page or a pure helper.

## Done when
- [ ] `/` shows hero, how-it-works, pricing, install-snippet placeholder, footer
- [ ] Pricing numbers match §5
- [ ] Responsive on mobile and desktop
- [ ] "Start free" links to `/sign-up`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- No live widget embed on this page yet — mock the live-demo section as a static visual, not a real iframe. Real embed lands in Phase 6 (§6.1 final polish).
- P1-T03 (Bob) adds `PLAN_LIMITS` to `packages/shared` for the pricing numbers. If it isn't merged when you start, hardcode the §5 numbers as a placeholder and swap to the `packages/shared` import once it lands — don't wait on it.
- `/sign-up` doesn't exist until P1-T05 merges. Link to it anyway; it 404s harmlessly until then.
