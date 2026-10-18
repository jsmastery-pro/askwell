# P6-T01 — Security audit (report only)

| Field | Value |
|---|---|
| Owner | John |
| Lane | A |
| Needs first | All Phase 0–5 tasks merged |
| Files allowed | `docs/security-review.md` (new) |
| project.md | §9 Security rules (all), §3, §6.5, §6.6 |

## Goal
A findings report that P6-T02 fixes from. No app code changes here. John audits because Bob wrote most of the code, and a second reviewer catches more.

## Scope
1. Every rule in project.md §9, checked against the code on `main`, rule by rule:
   - plan bypass
   - tenant leak
   - public key abuse
   - cost abuse
   - prompt injection (visitor and documents)
   - file upload
   - XSS
   - CORS
   - postMessage
   - clickjacking
   - webhook
   - secrets
2. Items carried in from earlier reviews (see plan.md Phase 6 notes):
   - a missing `ARCJET_KEY` leaves widget rate limiting off
   - Arcjet's `ip.src` warning behind InstaCloud's Cloudflare edge
   - #77 (`first_chat`, `$ai_generation` in `lib/chat`) was never reviewed by CodeRabbit
3. Unresolved CodeRabbit or John review threads on merged PRs.
4. Secrets in output: nothing secret in `NEXT_PUBLIC_*`, in the client bundle, or in `widget.js`.

## Output
`docs/security-review.md`: one row per finding with rule, file:line, severity (high / medium / low), what breaks, and the proposed fix. Rules that pass are listed as passing, with the evidence.

## Done when
- [ ] Every §9 rule has a pass or a finding
- [ ] Every carried-over item is addressed
- [ ] P6-T02's file scope can be written from the report
