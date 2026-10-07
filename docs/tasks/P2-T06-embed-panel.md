# P2-T06 — Embed panel with mock replies

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | B |
| Needs first | P2-T01 (P2-T03 via mock) |
| Files allowed | `apps/web/app/embed/**`, `apps/web/components/widget-panel/**` |
| project.md | §6.5 Widget (Panel), §9 Security rules (XSS, postMessage) |

## Goal
The `/embed?key=...` page inside the iframe: header, message list, input, typing state, badge, visitor ID, and a mock reply.

## Steps
1. Server-side, resolve config with `getWidgetConfigByKey(key)` (P2-T03). Unknown key → minimal "unavailable" state.
2. UI: header text, message list, input, typing state, "Powered by `APP_NAME`" badge when `showBadge`.
3. Visitor ID: random ID in the iframe's `localStorage`, reused across visits. Wrap storage access in try/catch; fall back to an in-memory ID.
4. Replies: one function, `getReply(message)`, in `apps/web/app/embed/` that waits briefly and returns a canned reply. Phase 3 swaps only this function for the chat route.
5. Close button posts `close` to the parent using the `origin` query param as target origin. Never `*`. Post `unread` when a reply arrives.
6. Every visitor message and reply renders as text — no `dangerouslySetInnerHTML`.
7. Tests: a message containing `<img src=x onerror=alert(1)>` renders as literal text; visitor ID is stable across reloads; badge hidden when `showBadge` is false.

## Done when
- [ ] Sending a message shows the typing state, then the mock reply
- [ ] HTML in messages renders as literal text
- [ ] Visitor ID persists across reloads
- [ ] `close` is posted to the exact parent origin, never `*`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Until P2-T03 merges, use a local fixture from `DEFAULT_WIDGET_CONFIG` inside `apps/web/app/embed/`; switch to `getWidgetConfigByKey` once it lands. Don't edit `apps/web/lib/widget-config`.
- Framing headers are P2-T07's job, not this task's.
- Panel must not import Clerk or require sign-in.
