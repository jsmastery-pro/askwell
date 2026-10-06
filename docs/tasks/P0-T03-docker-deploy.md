# P0-T03 — Docker + env + first deploy

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P0-T02 |
| Files allowed | `Dockerfile`, `.dockerignore`, `.env.example` |
| project.md | §3 Stack, §4 Environments, §11 Environment variables |

## Goal
Package `apps/web` as a Docker image from the Next.js standalone build. Deploy it to Bob's InstaCloud environment, so the product owner can deploy `main` the same way.

## Steps
1. Write a multi-stage `Dockerfile` at the repo root:
   - Install with pnpm (Node 22).
   - Build `apps/web`.
   - Copy the standalone output, `.next/static` and `public` into a slim runtime image.
   - Run it as a non-root user on `PORT`, defaulting to 3000.
2. Add `.dockerignore`: `node_modules`, `.next`, `.turbo`, `.git`, `.env*` (but keep `.env.example`), `ROLE.md`, `dist`.
3. Add `.env.example` with every variable in §11, with no values. Put a one-line comment above each one saying what it's for.
4. Build and run the image locally. Confirm the home page loads.
5. Deploy to your InstaCloud environment (`bob`). Put the URL in the PR.

## Done when
- [ ] `docker build -t askwell .` succeeds from the repo root
- [ ] `docker run -p 3000:3000 askwell` serves the home page, showing `APP_NAME`
- [ ] The image contains no `.env` file or secret
- [ ] `.env.example` lists every variable in §11, and every value is empty
- [ ] Bob's InstaCloud URL loads the home page, and the URL is in the PR
- [ ] PR body has the exact steps the product owner will use to deploy `main`

## Notes
- Don't deploy `main`. The product owner deploys it after this PR merges. That deploy closes Phase 0.
- No build args or runtime env vars are needed yet. Don't bake any key into the image.
- If the InstaCloud deploy needs a file outside "Files allowed" (for example an InstaCloud config file), stop and ask.
