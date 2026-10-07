# P2-T05 — Widget loader script

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | B |
| Needs first | P2-T01 (P2-T03 via mock) |
| Files allowed | `apps/widget/src/**` |
| project.md | §6.5 Widget (Loader), §9 Security rules (postMessage, XSS) |

## Goal
`widget.js` reads `data-key`, fetches the config, renders a floating button in a shadow root, and opens the `/embed` iframe.

## Steps
1. Find its own `<script>` tag; read `data-key`. Derive the app origin from the script's `src` — no hardcoded URL.
2. `fetch(<origin>/api/widget/config?key=...)`. Non-200 → render nothing, log nothing noisy.
3. Render the button inside a shadow root attached to one host element. Styles from config (color, position, label). No global CSS, no globals except what's unavoidable.
4. On click, open an iframe at `<origin>/embed?key=pk_...&origin=<host page origin>` with the configured animation. Click again or a `close` message closes it.
5. `message` listener: ignore anything where `event.origin !== appOrigin` or the type guard from `packages/shared` fails. Handle `close`, `resize`, `unread`.
6. Never post data with target origin `*`.
7. Tests (vitest + jsdom): bad key → nothing in the DOM; button lives in a shadow root; a message from a wrong origin is ignored.

## Done when
- [ ] Loader tests pass
- [ ] A bad key leaves the host page untouched
- [ ] Messages from any origin other than the app are ignored
- [ ] `pnpm --filter @askwell/widget build` produces `dist/widget.js`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Until P2-T03 merges, mock the fetch with a fixture typed as the shared config response (from `WIDGET_DEFAULTS`). Don't define your own config type.
- Keep the bundle small: no frameworks in the loader.
- New dev deps (e.g. jsdom) are fine; name them in the PR body.
