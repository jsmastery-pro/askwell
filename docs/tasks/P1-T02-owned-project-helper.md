# P1-T02 — getOwnedProject helper

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P1-T01 |
| Files allowed | `packages/db/**` |
| project.md | §7 Data model (tenant isolation), §9 Security rules (tenant leak) |

## Goal
A single, reusable helper every owner route will use to confirm a project belongs to the signed-in user.

## Steps
1. `packages/db/queries/projects.ts`: `getOwnedProject(projectId, ownerId)`. Fetches the project; returns it only if `project.owner_id === ownerId`.
2. Return `null` both when the project doesn't exist and when it's owned by someone else — never distinguish the two to a caller.
3. No Clerk import anywhere in `packages/db`. The caller resolves `ownerId` from Clerk and passes it in as a plain string.
4. Unit tests: owner matches → returns the project; wrong owner → `null`; missing project → `null`.

## Done when
- [ ] `getOwnedProject` is exported from `packages/db`
- [ ] Returns the row only on an exact owner match
- [ ] Returns `null` (not a throw) for both "not found" and "not owned"
- [ ] A test for each of the three cases
- [ ] `packages/db` has no dependency on `@clerk/nextjs` or any Next.js package

## Notes
- Future routes (Phase 2+) will call `getOwnedProject(id, clerkUserId)` and return a 404 on `null` either way — that's what keeps project existence private to non-owners.
