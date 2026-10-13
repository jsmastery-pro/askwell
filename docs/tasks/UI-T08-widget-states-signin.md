# UI-T08 — Chat panel states, sign-in redirect, preview focus

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | UI track |
| Needs first | UI-T06 |
| Files allowed | `apps/web/app/embed/**`, `apps/web/components/widget-panel/**`, `apps/web/proxy.ts` (sign-in/up URLs only) |
| project.md | §6.2 Auth, §6.5 Widget (Panel), §9 Security rules (XSS) |
| See | `docs/ui-track.md` (rules) |

## Goal
The last UI pieces: the chat panel shows every state the real chat route can produce, signed-out visitors land on our own sign-in page, and the panel's input has a visible focus ring. After this, the UI is complete and Phase 3 only wires data.

## Steps
1. **Panel error states.** Make the panel's reply function report *why* it failed: a typed error carrying an `ERROR_CODES` value from `packages/shared` (`rate_limited`, `quota_exceeded`, anything else = generic). Keep the mock in `app/embed/reply.ts` returning the preview reply. It never fails by itself, so the states are driven by tests (no magic messages or query flags in the shipped panel).
   - `rate_limited` → "You're sending messages too fast. Try again in a minute."
   - `quota_exceeded` → "This assistant is unavailable right now." Disable the input with that note, since every further message would fail too.
   - Network or other → "Something went wrong." plus a **Try again** button that resends the same message. It must not add the visitor's message a second time.
   - Never show raw error text. Every message renders as text.
2. **Message length.** The input enforces `MAX_CHAT_MESSAGE_LENGTH` from `packages/shared`. Show a small counter once the draft is near the limit (e.g. the last 100 characters).
3. **Focus ring.** The panel's text input (and any other control that shows focus only as a colour change) gets a visible focus outline with at least 3:1 contrast against white, readable whatever the owner's brand colour is. It shows in the Customize live preview too, since that reuses `Panel`.
4. **Sign-in redirect.** A signed-out visit to `/dashboard/*` redirects to our `/sign-in` (and sign-up links to `/sign-up`), not Clerk's hosted page. Set the sign-in/up URLs in the Clerk config (e.g. `clerkMiddleware` options in `proxy.ts`). **Don't change** the route matchers, the API 401 behaviour, or which routes are protected.
5. Tests: each error state (copy, no raw text, quota disables the input, Try again resends once), the length limit, and the redirect target if it can be unit-tested.

## Done when
- [ ] Tests show the rate-limit, quota and generic-error states, and Try again resends without a duplicate visitor message
- [ ] The input stops at 1,000 characters and shows the counter near the limit
- [ ] Tab into the panel input (on `/embed` and in Customize's preview) shows a clear focus ring
- [ ] `curl -sI <alice-url>/dashboard` while signed out → `Location` is `/sign-in…` on our domain, not `accounts.dev`
- [ ] Signing in from there still lands on `/dashboard/projects`; signing out still goes to `/sign-in`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- **P3-T06** later swaps the mock for `POST /api/widget/chat` and maps the real `error.code` to these states. It doesn't rebuild them.
- `proxy.ts` is auth code, so **this PR needs a CodeRabbit review** under the review rule in `plan.md`.
- Put screenshots of the three error states (375 px) in the PR. Render them however you like locally, e.g. a temporary edit to the mock you don't commit.
