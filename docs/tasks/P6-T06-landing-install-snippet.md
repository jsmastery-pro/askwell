# P6-T06 — Fix the landing page's "Install in one line" section

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | B |
| Needs first | P6-T03 (#79), P6-T04 (#81) |
| Files allowed | `apps/web/components/landing/InstallSnippet.tsx` and its test |
| project.md | §6.1 Landing page |

## Why
The product owner reports that the landing page's "Install in one line." section looks broken (2026-10-20). Since #79, the snippet shows the real app URL. That makes it one unbreakable line of about 100 characters (`<script src="https://prod-…instacloud-edge.com/widget.js" data-key="pk_..."></script>`). Before #79 it used the short `askwell.app`.

Likely cause, from the code: the section is a CSS grid (`grid-cols-1`, `lg:grid-cols-[1fr_1.1fr]`). Grid items default to `min-width: auto`, so the `<pre>`'s long line pushes its column wider than its share. The `<pre>`'s `overflow-x-auto` never applies. That's the same grid overflow P6-T04 fixed on the dashboard (`minmax(0, …)`).

## Steps
1. Reproduce on your deploy at 375 px and at desktop width, and describe in the PR what was broken.
2. Let the grid children shrink (`min-w-0` on both items, or `minmax(0, …)` tracks).
3. Make the whole tag readable without sideways scrolling: wrap the code (`whitespace-pre-wrap` with `break-all`, or break the line at attribute boundaries). It's a marketing snippet, and people should see all of it.
4. Check that the copy-paste text is still the exact one-line tag. Wrapping is visual only.
5. ~~Keep the focus ring and `tabIndex` from #81.~~ Correction (Bob, #83): those were on the dashboard Install page, not this landing snippet. With wrapping, nothing scrolls here, so no tab stop is needed.

## Done when
- [ ] At 375 px and desktop: no horizontal page scroll, and the full tag is visible
- [ ] A test, or a screenshot in the PR, shows the long URL case
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- UI-only: CodeRabbit isn't required.
