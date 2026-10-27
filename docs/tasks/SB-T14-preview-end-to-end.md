# SB-T14 — End-to-end check of the Supabase-native app on a preview

| Field | Value |
|---|---|
| Owner | Alice (API and database checks) + product owner (browser steps) |
| Track | Supabase-native |
| Needs first | SB-T04…T08 merged; the three Supabase vars in Vercel Preview |
| Files allowed | None. This is a check, not a code change. Report results to John; open a bug note for anything that fails. |

## Why
SB-T04…T07 were checked with tests and against dev's database, but never on a running preview: the Vercel env wasn't there yet. This covers every preview "Done when" left open on those tasks, in one pass.

## Setup (Alice)
1. Push an empty commit on a new branch from `main`, `alice/SB-T14-preview-check`, with no PR. Vercel builds a preview of `main` with the new env. Send John and the product owner its URL.
2. Agents call the preview with the `x-vercel-protection-bypass` header (`VERCEL_AUTOMATION_BYPASS_SECRET`). Never print or commit its value.
3. Delete the branch when the check is done.

## Browser steps (product owner, on the preview URL)
1. Sign up with a new Clerk test user. The dashboard loads (owner reads through RLS).
2. Create a project. A second project on Free is refused.
3. Knowledge: upload a 9 MB PDF and paste a text. Both reach `ready`. An 11 MB file is refused. A `.pdf` that isn't a PDF is refused.
4. Customize shows the paywall.
5. Send John the project's public key (Install page).

## API and database checks (Alice, after step 5)
| # | Check | Pass when |
|---|---|---|
| 1 | `GET /api/widget/config?key=<key>` | 200, Free defaults plus the badge |
| 2 | `POST /api/widget/chat` with a question about the PDF | The answer comes from the PDF |
| 3 | An unrelated question | The exact "I don't know" reply |
| 4 | Through the MCP: the project's `messages_used` | It went up by one per accepted message |
| 5 | 21 chat messages within a minute, same key and IP | The 21st gets 429 |
| 6 | A `conversationId` from another project | 404, and `messages_used` doesn't change |
| 7 | Owner routes with no session (`GET /api/projects`) | 401 |
| 8 | Storage: download the PDF's object with only the publishable key | Refused (the bucket is private) |
| 9 | Through the MCP: the PDF's chunks | They exist, under that project only |
| 10 | The widget loads on a plain HTML page served over `http`, pointing at the preview | The button shows and the panel chats |

## Browser steps, part 2 (product owner)
6. Upgrade to Pro with a Clerk Billing test card. Customize unlocks. Change the button color, save, and check `GET /api/widget/config` shows it (Alice).
7. Delete the pasted-text source. It's gone, and so are its chunks (Alice, through the MCP).
8. Delete the project. Its PDF object is gone from the `knowledge` bucket (Alice, through the MCP).

## Done when
- [ ] Every step and check above passes, or has a bug task
- [ ] John marks the preview "Done when" boxes on SB-T04…T07 as checked in `plan.md`
