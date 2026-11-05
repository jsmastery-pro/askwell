# Launch runbook

How the product owner takes Askwell to production in one sitting (project.md §4 "Production rollout", plan.md Phase 6). Do the steps in order. Each step has one action and a **Check** that shows it worked. If a check fails, stop there.

**What this runbook decides (PO):**
- Production reuses the **dev Clerk app**: test keys, test-mode Billing, no custom domain. It gets its own webhook endpoint.
- The house project behind the landing page's widget gets Pro **by hand**, with one SQL update.
- Production gets its **own Supabase project**. Never copy data from dev (§4): only the migration files go to production.

**Never paste a secret into this file, a PR, a chat or a ticket.** Values go straight from one dashboard into Vercel.

**You need:** admin access to Supabase, Clerk, Vercel, OpenAI, Arcjet and PostHog, and this repo at the latest `main`.

---

## 1. Create the Supabase production project

1. Supabase Dashboard → **New project**. Name `askwell-prod`, plan **Free**. Save the database password in your password manager.
   - **Region:** **East US (North Virginia)**. The app has no pinned Vercel region, so its functions run in Vercel's default, `iad1` (Washington, D.C.).
   - Check the region in Vercel → Settings → Functions. If it isn't `iad1`, pick the Supabase region closest to it.
   - **Check:** the project's home page says it's healthy.
2. Leave **Data API** on (the default). The migrations grant table and function access explicitly, so the "expose new tables automatically" setting doesn't matter.
   - **Check:** Project Settings → Data API shows a project URL.
3. Supabase → Authentication → Sign In / Providers → **Third-Party Auth** → **Add provider** → **Clerk**. Enter the **same Clerk domain as the dev project** (the dev Clerk app's Frontend API URL, `….clerk.accounts.dev`).
   - The Clerk side is already set up: the dev app's session tokens already carry `role: authenticated` (Clerk → Integrations → Supabase).
   - **Check:** the provider shows **Enabled**, with the Clerk domain. To compare, open the dev Supabase project → the same page: it must show the same domain.

## 2. Check pgvector before any migration

`match_chunks` uses `hnsw.iterative_scan`, which needs **pgvector 0.8 or newer**.

4. Supabase → **SQL Editor** → run:

   ```sql
   select extversion from pg_extension where extname = 'vector';
   select default_version, installed_version from pg_available_extensions where name = 'vector';
   ```

   **Check:** read the results like this.

   | Result | Do |
   |---|---|
   | The first query returns no row (normal on a new project), and `default_version` is **0.8.0 or higher** | Nothing. Migration 1 installs that version. |
   | The first query returns a version **below 0.8** | Run `alter extension vector update;`, then run the first query again. It must show 0.8.0 or higher. |
   | `default_version` is **below 0.8** | Stop. The migrations will fail on `match_chunks`. Ask the lead. |

## 3. Apply every migration, in filename order

There are 4 files in `supabase/migrations`. Apply them in this order, each in one SQL Editor run.

1. `20261103171641_initial_schema.sql`
2. `20261103185329_create_project.sql`
3. `20261104103245_knowledge.sql`
4. `20261104110536_chat.sql`

For each file: SQL Editor → **New query** → paste the **whole** file from `main` → **Run**. Then run its check. If a run errors, stop: don't run the next file.

5. Run `20261103171641_initial_schema.sql`. **Check:** this returns 7 rows, all with `rowsecurity = true`.

   ```sql
   select tablename, rowsecurity from pg_tables
   where schemaname = 'public'
   order by tablename;
   ```

   The 7 tables are `accounts`, `conversations`, `knowledge_chunks`, `knowledge_sources`, `messages`, `projects` and `widget_configs`. Then `select extversion from pg_extension where extname = 'vector';` shows 0.8.0 or higher.

6. Run `20261103185329_create_project.sql`. **Check:** this returns `create_project`.

   ```sql
   select proname from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'create_project';
   ```

7. Run `20261104103245_knowledge.sql`. **Check:** the first query returns `claim_knowledge_source` and `reserve_knowledge_source`. The second returns one row: `knowledge | false | 10485760` (private, 10 MB).

   ```sql
   select proname from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('reserve_knowledge_source', 'claim_knowledge_source')
   order by 1;

   select id, public, file_size_limit from storage.buckets where id = 'knowledge';
   ```

   You can also open Storage → the `knowledge` bucket is listed as **Private**.

8. Run `20261104110536_chat.sql`. **Check:** this returns `consume_message`, `match_chunks` and `save_chat_turn`.

   ```sql
   select proname from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('consume_message', 'save_chat_turn', 'match_chunks')
   order by 1;
   ```

9. Final check: anon gets nothing. Run:

   ```sql
   select count(*) from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public';
   ```

   **Check:** `0`. Also open Advisors → **Security Advisor**: there's no error. A warning about the `extensions` schema is fine.

The SQL Editor doesn't record migration history. Any later migration for production must also be applied by hand, in filename order, after the ones above.

## 4. Clerk: add the production webhook endpoint

10. Find the production URL: Vercel → the project → Settings → **Domains**. It's the production domain, e.g. `https://askwell-….vercel.app`. This runbook calls it `<PROD_URL>`.
11. Check that production is public: Vercel → Settings → **Deployment Protection**. The setting must protect previews only ("Standard Protection"), not the production domain.
    - **Check:** in a private browser window, `<PROD_URL>` doesn't ask you to log in to Vercel. Before the first promote it may show a 404, but not a Vercel login.
12. Clerk Dashboard → the **dev** app → **Webhooks** → **Add Endpoint**.
    - URL: `<PROD_URL>/api/clerk/webhook`, with **no** `x-vercel-protection-bypass` parameter.
    - Events: tick every **`subscription.*`** and every **`subscriptionItem.*`** event.
    - Then **Create**.
    - **Check:** the dev app now lists **two** endpoints: the existing preview one, unchanged, and this one.
13. Open the new endpoint → **Signing Secret** → reveal it and copy it **straight into Vercel** (step 14, `CLERK_WEBHOOK_SIGNING_SECRET`). It's not the dev endpoint's secret.

## 5. Vercel: Production environment variables

14. Vercel → the project → Settings → **Environment Variables**. Add each variable below with **only "Production"** ticked. Don't change the Preview and Development values: they stay on the dev project.

    | Variable | Production value comes from |
    |---|---|
    | `NEXT_PUBLIC_SUPABASE_URL` | **Prod** Supabase → Project Settings → Data API → Project URL |
    | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Prod** Supabase → Project Settings → API Keys → publishable key (`sb_publishable_…`) |
    | `SUPABASE_SECRET_KEY` | **Prod** Supabase → Project Settings → API Keys → secret key (`sb_secret_…`). Server only |
    | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same as dev: the dev Clerk app → API Keys (`pk_test_…`) |
    | `CLERK_SECRET_KEY` | Same as dev: the dev Clerk app → API Keys (`sk_test_…`) |
    | `CLERK_WEBHOOK_SIGNING_SECRET` | The **new production endpoint's** signing secret (step 13). Not the dev endpoint's |
    | `OPENAI_API_KEY` | Same as dev's value (OpenAI → API keys) |
    | `ARCJET_KEY` | Same as dev's value (Arcjet → the site → SDK configuration) |
    | `NEXT_PUBLIC_POSTHOG_KEY` | Same as dev's value (PostHog → Project settings → Project API key) |
    | `NEXT_PUBLIC_POSTHOG_HOST` | Same as dev's value (PostHog → Project settings → host) |
    | `NEXT_PUBLIC_APP_URL` | `<PROD_URL>` (step 10), with no trailing slash |
    | `LANDING_WIDGET_KEY` | **Not yet.** Set in step 22, after the house project exists |

    **Check:** filter the list by **Production**. It shows the 11 variables above, and no `LANDING_WIDGET_KEY` yet. The three Supabase values are the **prod** project's: the URL's subdomain is the prod project ref, not the dev one (`pjyukeqhjqgqazdwwjuv`).

## 6. Build, promote and smoke check

The `main` builds made so far had no Production variables. The `NEXT_PUBLIC_*` values are baked in at build time, so those builds can't be promoted. Build again first.

15. Vercel → **Deployments** → filter **Production** → the newest deployment from `main` → **⋯** → **Redeploy**. Untick "Use existing Build Cache".
    - **Check:** the new deployment is **Ready**. Automatic promotion is off, so it isn't serving the domain yet.
16. On that deployment → **⋯** → **Promote**.
    - **Check:** Deployments shows it as **Current** on `<PROD_URL>`.
17. Smoke check, in a private browser window:
    - `<PROD_URL>/` loads the landing page. Its live demo shows a static mock and no chat button until step 22, which is expected.
    - **Sign up** with a new email works and lands on `/dashboard`. The Clerk app is shared with dev, so use an email that has no Clerk user yet.
    - `/dashboard` loads with no error, and shows "No projects yet".
    - **Check in the prod SQL Editor:** `select clerk_user_id, plan from accounts;` shows that new user with `free`. That proves the app writes to the **prod** database.
18. Webhook reachability: from a terminal, run

    ```bash
    curl -s -X POST <PROD_URL>/api/clerk/webhook
    ```

    **Check:** the body is `{"error":{"code":"invalid_signature",…}}` (HTTP 400). That means the route is reachable without a Vercel login and verifies signatures. A Vercel login page or a 401 means production is protected: go back to step 11.

## 7. The house project (landing page widget)

19. Sign in on `<PROD_URL>` as **yourself (the PO)** → Dashboard → **New project** → name `House: Askwell`.
    - **Check:** the project card shows on the dashboard.
20. Open the project → **Knowledge** → **Paste text**. Title `Askwell`. Body: the whole of `docs/landing-knowledge.md` from `main` (added by B1, PR #41). Then **Add text**.
    - **Check:** the source shows **Ready** within a minute. "Failed" means the OpenAI key is wrong (step 14).
21. Open **Install** and copy the public key from the script tag: the `data-key` value, `pk_…`. Then, in the prod SQL Editor, run (with that key):

    ```sql
    update public.accounts
    set plan = 'pro'
    where clerk_user_id = (select owner_id from public.projects where public_key = 'pk_…')
    returning clerk_user_id, plan;
    ```

    **Check:** exactly **1 row**, `plan = pro`. The app's Billing page for your account now shows Pro.

    Don't use this account to test checkout or cancel in Clerk. A billing event for it makes the webhook re-read Clerk's subscription and set the plan back to `free`.
22. Vercel → Settings → Environment Variables → add `LANDING_WIDGET_KEY` = that `pk_…`, **Production only**.
23. Vercel → Deployments → the current production deployment → **⋯** → **Redeploy**. The build cache may be reused: the key is read at request time, but Vercel only applies new variables to new deployments. Then **Promote** the new deployment.
    - **Check:** `<PROD_URL>/` shows the chat button in the corner. Ask "How much is Pro?" The answer says **$19 per month**.

## 8. Hand off

24. Message the lead (Michael) that production is live, with `<PROD_URL>`. Jim then runs the nine-step core flow (project.md §2) on production as task **B4**, with a fresh account, not the PO's.
    - **Check:** B4's results are posted on its PR.

---

## Rollback

- **App:** Vercel → Deployments → filter **Production** → the previous good deployment → **⋯** → **Promote** (or **Instant Rollback** on the current one). The domain switches within seconds, with no rebuild.
  - **Check:** `<PROD_URL>/` serves the older build. Deployments marks it **Current**.
  - Before the first launch there's no previous production build. If step 16 or later goes wrong, fix forward, or leave the domain without a promoted build until it's fixed.
- **Variables:** rolling back a deployment keeps the variables it was built with. If a variable was wrong, fix it in Vercel, then redeploy and promote again (step 15–16).
- **Database:** migrations are additive (§4), so an older build still works on the newer schema. Don't drop anything to roll back. If a migration fails halfway, stop and ask the lead; don't run the later files.
- **Webhook:** to stop production plan sync, disable the production endpoint in Clerk → Webhooks. The dev endpoint is separate and unaffected.
