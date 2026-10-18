# P6-T02 — Security fixes

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P6-T01 |
| Files allowed | Set by John from `docs/security-review.md` before this starts |
| project.md | §9 Security rules |

## Goal
Fix every high and medium finding in `docs/security-review.md`. Low findings get fixed if cheap, or answered in the report.

## Already decided (product owner, 2026-10-18)
- **Missing `ARCJET_KEY` in production:** `POST /api/widget/chat` returns `503` with a clear error code when `ARCJET_KEY` is unset and the app runs in production. Paid AI calls must never run unlimited per minute because of a config mistake. Unchanged:
  - Arcjet errors and timeouts still fail open.
  - `GET /api/widget/config` keeps working.
  - Local dev without the key keeps working.

## Done when
- [ ] Every high and medium finding is fixed, with a test where it can be tested
- [ ] `docs/security-review.md` marks each finding fixed (with PR) or answered
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- CodeRabbit is required.
