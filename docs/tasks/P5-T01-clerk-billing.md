# P5-T01 — Clerk Billing: webhook, pricing table, drop Stripe

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P1-T02 |
| Files allowed | `apps/web/app/api/clerk/webhook/**`, `apps/web/components/billing/**`, `apps/web/lib/data/billing.ts`, `apps/web/lib/data/billing-actions.ts`, `packages/shared/src/billing.ts`, `packages/db/schema/**`, `packages/db/migrations/**`, `.env.example` |
| project.md | §6.10 Billing, §5 Plans, §7 Data model, §9 Security rules (Webhook) |

## Background
Product owner decision (2026-10-17): Clerk Billing replaces Stripe entirely. There is no Stripe account or Stripe keys. Clerk Billing (pro plan, test mode) is already configured on the Clerk dashboard, and `CLERK_WEBHOOK_SIGNING_SECRET` plus a webhook to `/api/clerk/webhook` with the subscription events are already set up — confirmed by the product owner, 2026-10-17. A Clerk MCP server is being installed in your sandbox; use it to look up the current Clerk Billing APIs (`has()`, `<PricingTable />`, webhook event names/payloads) rather than guessing from memory, since this is a newer Clerk feature.

UI-T05 already built the Billing page (`apps/web/app/dashboard/billing/**` — not in your file list, don't touch it) with `PlanActions` showing mocked "Opens Stripe Checkout" / "Opens the Stripe portal" buttons. This task replaces that mocked flow with Clerk's own components and a real webhook — it's not just a `lib/data` wiring task like the others, since the actual UI mechanism changes (no more routes we own for checkout/portal).

## Steps
1. **Webhook**: `POST /api/clerk/webhook`. Verify the Svix signature (Clerk's webhook library) before touching anything — reject unverified requests. On a subscription-active event for a user, set `accounts.plan = "pro"`; on cancel/expire, set `"free"`. Keep `getAccountPlan` (`lib/data/billing.ts`) as the single read path — don't change its signature or its callers.
2. **Pricing table**: replace `PlanActions`'s Free-side button with Clerk's `<PricingTable />` (or the current Clerk Billing equivalent — check via the Clerk MCP server) instead of our own `startCheckout` mock/route. Match the existing page's visual style as closely as the component allows.
3. **Manage subscription**: replace the Pro-side button with whatever Clerk provides for managing an active subscription (its own portal/redirect) instead of our own `openBillingPortal` mock/route.
4. Drop the dead code: `lib/data/billing-actions.ts`'s `startCheckout`/`openBillingPortal`, and `packages/shared/src/billing.ts`'s `CheckoutResponse`/`PortalResponse`/`StripeWebhookResponse` types (grep for other importers first — don't leave anything referencing a route or type that no longer exists).
5. **Schema**: drop `accounts.stripe_customer_id` (unused once Clerk owns the customer record). `pnpm db:generate` for the migration. Update the schema test's column list.
6. Tests: webhook rejects a bad/missing signature; a subscription-active event flips `accounts.plan` to `pro`; a cancel event flips it back to `free`; an unrelated event is a no-op; `getAccountPlan` is unaffected for callers elsewhere in the app.

## Done when
- [ ] Clerk MCP server installed and used to confirm current API shapes (webhook payload, pricing table usage) before implementing
- [ ] A test webhook event (Clerk's dashboard "Send test event", or a signed fixture in your test) updates `accounts.plan`
- [ ] An unsigned/bad-signature request to the webhook is rejected, not processed
- [ ] The Billing page's Free side shows Clerk's pricing table; the Pro side can manage/cancel through Clerk
- [ ] No remaining reference to Stripe, `startCheckout`, `openBillingPortal`, or the dropped shared types (`grep -rni stripe apps packages --include="*.ts" --include="*.tsx"` returns nothing outside this PR's own removal)
- [ ] `accounts.stripe_customer_id` is gone from the schema; the migration drops it
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- **CodeRabbit is required** (webhook route + migration + `packages/shared` change).
- The product owner runs the migration on `main`. Your branch DB is yours to test the drop on.
- This is a confirmed contract change (schema column drop, `packages/shared` type removal) — already approved by the product owner; no need to stop and ask again, just flag anything that doesn't match this file in the PR body.
- Don't touch the Billing page itself (`app/dashboard/billing/page.tsx`) beyond what's needed to mount the new components in `PlanActions` — the page's layout/copy is UI-T05's.
