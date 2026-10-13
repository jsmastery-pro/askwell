# UI-T10 — Design tokens + landing page redesign (dark, glass, motion)

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | UI track |
| Needs first | UI-T09 |
| Files allowed | `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/page.test.tsx`, `apps/web/app/(auth)/**`, `apps/web/components/landing/**` |
| project.md | §6.1 Landing page, §6.2 Auth (pages only) |
| See | `docs/ui-track.md` (rules) |

## Goal
A modern black-and-white look. This task sets up shared design tokens and rebuilds the landing page (and the sign-in/up pages) in a **dark** monochrome style with frosted-glass surfaces and simple motion. The product owner approves the look on the `alice` preview before the dashboard follows in UI-T11. Product owner decision, 2026-10-13: dark landing, light app, landing first.

## Steps
1. **Design tokens.** Define the palette once with Tailwind v4 `@theme` in `globals.css`: a grayscale ramp (canvas, surface, line, muted text, text) for **light and dark**, glass tokens (fill, border, blur), and **semantic** colors that stay in colour because they carry meaning: warning (amber), danger (red), success. Name them by role, not value (`--color-surface`, not `--color-gray-50`). The landing page uses only tokens: no `#xxxxxx` literals left in `components/landing/**`. Don't touch `components/ui/styles.ts` or the dashboard here; UI-T11 moves them onto the tokens.
2. **Dark landing, monochrome.**
   - Black canvas with a subtle grayscale background: a soft radial glow, gradient or grain, so the glass has something to blur.
   - Glass on **surfaces only**: the sticky nav, the hero card or chat mock, feature cards, the pricing cards. Text sits on solid or near-solid fills.
   - Drop the amber accent. Emphasis comes from white versus gray, weight and size.
   - The live demo/chat mock keeps a neutral look. Customers' widgets keep their own brand colour (the widget itself isn't part of this redesign).
3. **Glass rules.** `backdrop-filter` with an `@supports` fallback to a solid fill. A 1 px light border on glass edges. Text on glass meets **4.5:1** (3:1 for large text), measured over the brightest point of the background behind it.
4. **Motion** (simple, CSS first):
   - Sections fade or slide up as they enter the viewport (one small `IntersectionObserver` client component, or CSS scroll-driven animation with a fallback).
   - Soft hover states on buttons and cards.
   - Optionally, a gentle ambient movement in the hero background.
   - No motion library unless you name it and its size in the PR.
   - Everything respects `prefers-reduced-motion: reduce`: no movement, content shown immediately.
   - Content is never hidden if JavaScript fails. The reveal starts from visible in the HTML and is enhanced on the client.
5. **Sign-in and sign-up pages.** The same dark look around Clerk's `<SignIn>`/`<SignUp>`, using Clerk's `appearance` prop (dark base, monochrome, our fonts). Don't change their routes or redirect props.
6. **Focus.** A visible focus ring on dark (white or light gray, at least 3:1 against the canvas) on every interactive element.
7. **Fonts.** Keep the current fonts unless a change clearly helps the look. If you change them, say why in the PR.

## Done when
- [ ] The landing page and sign-in/up pages are dark, monochrome, with glass surfaces; the screenshots at 1280 and 375 px are in the PR
- [ ] Sections animate in on scroll; with "reduce motion" on (DevTools emulation), nothing moves and all content shows
- [ ] With JavaScript disabled, all landing content is visible
- [ ] `grep -rnE "#[0-9a-fA-F]{6}" apps/web/components/landing` finds nothing (tests excepted)
- [ ] Text contrast on glass ≥ 4.5:1 (list the pairs you measured in the PR); focus is visible on every link and button
- [ ] No horizontal scroll at 375 px
- [ ] Lighthouse mobile **Performance** and **Accessibility** for `/` are no lower than on `main` before the change (both before/after numbers in the PR)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass
- [ ] **The product owner approves the look on the `alice` preview** (comment on the PR). UI-T11 starts only after that.

## Notes
- The landing copy and sections stay the same (§6.1); this is a visual task. Pricing numbers still come from `PLAN_LIMITS`.
- Keep `/` fast. The hero is server-rendered, and only the reveal/hover helpers are client components.
- `backdrop-filter` is costly on large areas on phones. Blur cards and the nav, not full-screen layers.
