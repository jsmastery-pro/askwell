# P4-T04 — `first_chat` event + AI trace

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | B |
| Needs first | P4-T03 (#69), P3-T05 (#72), P3-T06 (#74) |
| Files allowed | `apps/web/lib/chat/**`, `apps/web/app/api/widget/chat/**`, `apps/web/lib/posthog/**`, plus their co-located tests |
| project.md | §6.11 Analytics, §6.6 Chat (step 6, Track), §9 Security rules |

## Why
P4-T03 shipped PostHog with five events but deferred `first_chat` and the AI trace, because the chat route didn't exist yet. It does now (#72, #74). This closes Phase 4's done-when: "PostHog shows the events and an AI trace with its cost."

## Steps
1. **`first_chat`**, server-side in the chat flow. It fires once per project, when the project's first conversation is saved.
   - `distinctId` = the project owner's Clerk user ID, so it joins the owner's funnel.
   - Properties: `project_id`.
   - Never fire it from `/embed` or the browser: PostHog doesn't load there, and visitors are never tracked.
   - "Once" must hold under concurrent requests. Base it on something the save transaction can prove (e.g. the project had no conversations before this insert), not a separate read.
2. **AI trace**: one PostHog `$ai_generation` event per model call. Use the telemetry `lib/chat` already returns.
   - `$ai_model`, `$ai_provider: "openai"`, `$ai_input_tokens`, `$ai_output_tokens`, `$ai_latency` (seconds), `$ai_trace_id` = the conversation ID (groups a conversation's replies), plus `project_id`. PostHog computes cost from model and tokens. If it doesn't for our model, send `$ai_total_cost_usd` and say how you priced it.
   - **No content.** Never send the visitor message, the chunks or the reply (`$ai_input`, `$ai_output_choices`, etc.): that's visitor data.
   - `distinctId` = the project owner's Clerk user ID. Don't create a PostHog person per visitor.
   - A reply that skipped the model (no chunks → "I don't know") sends no `$ai_generation`.
3. Capture after the reply is saved. Use the never-throws helpers in `lib/posthog/server.ts`. PostHog failing or missing a key must never change the reply, its status code or its latency in a way the visitor notices.
4. Add `first_chat` to the server event type in `lib/posthog/server.ts`.
5. Tests:
   - `first_chat` fires on a project's first saved chat only, not the second, and not twice under concurrency.
   - `$ai_generation` has the right properties and no content.
   - No trace when the model wasn't called.
   - A throwing PostHog client still returns the reply.

## Done when
- [ ] On your `bob` deploy: a first chat in a new project shows `first_chat` in PostHog, and each model reply shows as an AI generation with model, tokens, cost and latency, grouped by conversation (or say exactly which part you couldn't see from the sandbox, for the product owner to confirm)
- [ ] No visitor text or document text in any PostHog event
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- CodeRabbit is required (chat route).
- The funnel's last steps (`first_chat` → `upgraded`) can be added to the PostHog dashboard by the product owner once this merges.
