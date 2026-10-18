# P3-T06 — Connect the panel to chat

| Field | Value |
|---|---|
| Owner | Bob (reassigned from Alice 2026-10-17, product owner) |
| Lane | B |
| Needs first | P3-T05, P2-T06 |
| Files allowed | `apps/web/app/embed/**`, `apps/web/components/widget-panel/**` |
| project.md | §6.5 Widget (Panel), §6.6 Chat, §9 Security rules (XSS) |

## Goal
The `/embed` panel sends real messages to `POST /api/widget/chat` instead of the Phase 2 mock.

## Steps
1. Replace `getReply` with a call to `/api/widget/chat` (key, visitor ID, conversation ID, message).
2. Keep the returned `conversationId` in the iframe's `localStorage` next to the visitor ID (try/catch, in-memory fallback) and send it on later messages.
3. Error states are already built (UI-T09). Map the route's `error.code` (`rate_limited`, `quota_exceeded`, other) to them. Never show raw error text.
4. The 1,000-character input limit is already built (UI-T09). The server still checks.
5. Replies still render as text only.
6. Tests: success path shows the reply; `429` shows the friendly message; `conversationId` is reused on the second message.

## Done when
- [ ] On the Phase 2 cross-origin test page: upload a PDF → ask about it → correct answer
- [ ] An unrelated question → the "I don't know" reply
- [ ] Rapid-fire past 20 messages shows the rate-limit message
- [ ] Reloading continues the same conversation
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- This is the Phase 3 "Done when". Put a short clip in the PR.
- The end-to-end check needs P3-T02 merged for real uploads. Until then, use seeded chunks.
- **Updated 2026-10-18 (John), from the merged route (#72):** errors are `{ error: { code, message } }`. `429` comes with `rate_limited` (plus `Retry-After`) or `quota_exceeded`. `404` `not_found` means the key or the stored `conversationId` isn't valid for this project: for a stale `conversationId`, clear it from storage and resend once without it, so the visitor isn't stuck. A `500` is generic, so show the friendly error. Never show `message` text from the server.
- Test from an `http(s)` host page, not a file opened from disk: `frame-ancestors *` doesn't match `file://`, so the panel won't load there.
- No PostHog here: `first_chat` is P4-T04.
