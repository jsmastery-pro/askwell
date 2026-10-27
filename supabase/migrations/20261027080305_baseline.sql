-- Baseline: today's schema (packages/db migrations 0000-0003), rebuilt as a Supabase migration,
-- plus row-level security that isolates each owner's data in the database.
--
-- Who is who: a request through Supabase's Data API with a Clerk session token runs as
-- `authenticated`, and the Clerk user ID is `auth.jwt()->>'sub'`. Without a token it runs as
-- `anon`, which gets nothing. The server connects as the tables' owner, which RLS doesn't apply
-- to (no FORCE): writes that need a plan or limit check go through it, or through SB-T03's
-- functions, never through a direct policy here.

-- pgvector lives in `extensions`, as Supabase recommends (not in the API-exposed `public`).
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TYPE public.plan AS ENUM ('free', 'pro');
CREATE TYPE public.widget_position AS ENUM ('bottom-right', 'bottom-left', 'top-right', 'top-left');
CREATE TYPE public.widget_animation AS ENUM ('fade', 'slide', 'scale');
CREATE TYPE public.source_type AS ENUM ('text', 'pdf', 'md', 'txt');
CREATE TYPE public.source_status AS ENUM ('processing', 'ready', 'failed');
CREATE TYPE public.message_role AS ENUM ('visitor', 'bot');

-- Tables ------------------------------------------------------------------------------------

CREATE TABLE public.accounts (
  clerk_user_id text PRIMARY KEY,
  plan public.plan NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES public.accounts (clerk_user_id) ON DELETE CASCADE,
  name text NOT NULL,
  public_key text NOT NULL CONSTRAINT projects_public_key_unique UNIQUE,
  messages_used integer NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_owner_id_idx ON public.projects (owner_id);

-- Null text fields mean "use the app default" from packages/shared.
CREATE TABLE public.widget_configs (
  project_id uuid PRIMARY KEY REFERENCES public.projects (id) ON DELETE CASCADE,
  button_color text,
  position public.widget_position NOT NULL DEFAULT 'bottom-right',
  label text,
  animation public.widget_animation NOT NULL DEFAULT 'fade',
  header_text text,
  show_badge boolean NOT NULL DEFAULT true
);

CREATE TABLE public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  title text NOT NULL,
  type public.source_type NOT NULL,
  -- Null for pasted text.
  storage_key text,
  status public.source_status NOT NULL DEFAULT 'processing',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_sources_project_id_idx ON public.knowledge_sources (project_id);

CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.knowledge_sources (id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding extensions.vector(1536) NOT NULL
);
CREATE INDEX knowledge_chunks_project_id_idx ON public.knowledge_chunks (project_id);
CREATE INDEX knowledge_chunks_source_id_idx ON public.knowledge_chunks (source_id);
CREATE INDEX knowledge_chunks_embedding_idx ON public.knowledge_chunks
  USING hnsw (embedding extensions.vector_cosine_ops);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_project_id_idx ON public.conversations (project_id);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  role public.message_role NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_id_idx ON public.messages (conversation_id);

-- Ownership helpers ---------------------------------------------------------------------------
-- SECURITY DEFINER so a child table's policy can check the parent without RLS on the parent
-- running again for every row. The empty search_path means every name is schema-qualified, so a
-- caller can't shadow `projects` or `auth.jwt` with their own objects.

CREATE FUNCTION public.owns_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND owner_id = (auth.jwt() ->> 'sub')
  );
$$;

-- messages has no project_id: it belongs to a project through its conversation.
CREATE FUNCTION public.owns_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = p_conversation_id AND p.owner_id = (auth.jwt() ->> 'sub')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.owns_project(uuid), public.owns_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_project(uuid), public.owns_conversation(uuid) TO authenticated;

-- Row-level security ------------------------------------------------------------------------

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- `(SELECT auth.jwt() ...)` is evaluated once per statement, not once per row.

-- accounts: read your own row. The plan is written by the server (Clerk billing webhook) only.
CREATE POLICY accounts_select_own ON public.accounts
  FOR SELECT TO authenticated
  USING (clerk_user_id = (SELECT auth.jwt() ->> 'sub'));

-- projects: read, rename and delete your own. No INSERT policy: creation checks the plan's
-- project limit, so it goes through SB-T03's function.
CREATE POLICY projects_select_own ON public.projects
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.jwt() ->> 'sub'));

CREATE POLICY projects_update_own ON public.projects
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.jwt() ->> 'sub'))
  WITH CHECK (owner_id = (SELECT auth.jwt() ->> 'sub'));

CREATE POLICY projects_delete_own ON public.projects
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.jwt() ->> 'sub'));

-- Child tables: read when you own the parent project. Writes are plan- or limit-gated (config
-- save, knowledge add, the message quota) or come from widget visitors, so they get no policy.
CREATE POLICY widget_configs_select_own ON public.widget_configs
  FOR SELECT TO authenticated
  USING ((SELECT public.owns_project(project_id)));

CREATE POLICY knowledge_sources_select_own ON public.knowledge_sources
  FOR SELECT TO authenticated
  USING ((SELECT public.owns_project(project_id)));

CREATE POLICY knowledge_chunks_select_own ON public.knowledge_chunks
  FOR SELECT TO authenticated
  USING ((SELECT public.owns_project(project_id)));

CREATE POLICY conversations_select_own ON public.conversations
  FOR SELECT TO authenticated
  USING ((SELECT public.owns_project(project_id)));

CREATE POLICY messages_select_own ON public.messages
  FOR SELECT TO authenticated
  USING ((SELECT public.owns_conversation(conversation_id)));

-- Privileges ----------------------------------------------------------------------------------
-- RLS covers rows; these cover what policies can't.

-- anon gets nothing, not even a privilege for a future policy to open up by mistake.
REVOKE ALL ON public.accounts, public.projects, public.widget_configs, public.knowledge_sources,
  public.knowledge_chunks, public.conversations, public.messages FROM anon;

-- RLS doesn't apply to TRUNCATE, and Supabase grants it to its API roles.
REVOKE TRUNCATE ON public.accounts, public.projects, public.widget_configs, public.knowledge_sources,
  public.knowledge_chunks, public.conversations, public.messages FROM authenticated;

-- A policy can't limit columns: the owner may rename a project, but not reset messages_used or
-- period_start (the quota), change public_key, or hand the project to someone else.
REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (name) ON public.projects TO authenticated;
