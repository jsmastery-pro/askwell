-- Initial schema (project.md §7) with RLS, grants and the RLS helpers.
--
-- The Data API is public, so RLS and grants are the security boundary
-- (project.md §9 "Database API"):
--   anon           nothing: no table, no function.
--   authenticated  SELECT rows in its own projects; rename (name only) and
--                  delete its own projects. Nothing else.
--   service_role   everything except TRUNCATE. Server only.
--
-- Limit functions (create_project, consume_message, ...), owner_activity and
-- the Storage bucket come in their own phases.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One per Clerk user. The Clerk webhook keeps plan in sync.
create table public.accounts (
  clerk_user_id text primary key,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.accounts (clerk_user_id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  public_key text not null unique,
  messages_used integer not null default 0,
  period_start timestamptz not null default date_trunc('month', now()),
  created_at timestamptz not null default now()
);

-- One per project. Defaults equal DEFAULT_WIDGET_CONFIG in packages/shared.
create table public.widget_configs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  button_color text not null default '#000000'
    check (button_color ~ '^#[0-9a-fA-F]{6}$'),
  position text not null default 'bottom-right'
    check (position in ('bottom-right', 'bottom-left', 'top-right', 'top-left')),
  label text not null default 'Chat with us',
  animation text not null default 'fade'
    check (animation in ('fade', 'slide', 'scale')),
  header_text text not null default 'Ask us anything',
  show_badge boolean not null default true
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  type text not null check (type in ('text', 'pdf', 'md', 'txt')),
  -- Null for pasted text.
  storage_key text,
  status text not null check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

-- Deleted with their source and with their project.
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  content text not null,
  embedding extensions.vector(1536) not null
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  visitor_id text not null,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('visitor', 'bot')),
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes: one on every FK column (leading column), plus the HNSW index.
-- widget_configs.project_id is its primary key.
-- ---------------------------------------------------------------------------

create index projects_owner_id_idx on public.projects (owner_id);
create index knowledge_sources_project_id_idx on public.knowledge_sources (project_id);
create index knowledge_chunks_project_id_idx on public.knowledge_chunks (project_id);
create index knowledge_chunks_source_id_idx on public.knowledge_chunks (source_id);
create index conversations_project_id_created_at_idx
  on public.conversations (project_id, created_at desc);
create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);
create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- RLS helpers. SECURITY DEFINER so policies can read projects/conversations
-- without recursing into their own RLS. They only ever return the caller's
-- rows: the owner is always auth.jwt()->>'sub' (Clerk user IDs aren't UUIDs,
-- so never auth.uid()).
-- ---------------------------------------------------------------------------

create function public.owned_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.projects p
  where p.owner_id = (select auth.jwt() ->> 'sub')
$$;

create function public.owned_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.conversations c
  join public.projects p on p.id = c.project_id
  where p.owner_id = (select auth.jwt() ->> 'sub')
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.projects enable row level security;
alter table public.widget_configs enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Policies are for authenticated only. anon has none; service_role bypasses RLS.

create policy "Owners read their own account"
  on public.accounts for select to authenticated
  using (clerk_user_id = (select auth.jwt() ->> 'sub'));

create policy "Owners read their own projects"
  on public.projects for select to authenticated
  using (id in (select public.owned_project_ids()));

-- The column grant below limits this to name.
create policy "Owners rename their own projects"
  on public.projects for update to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'))
  with check (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners delete their own projects"
  on public.projects for delete to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners read their projects' widget config"
  on public.widget_configs for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy "Owners read their projects' knowledge sources"
  on public.knowledge_sources for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy "Owners read their projects' knowledge chunks"
  on public.knowledge_chunks for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy "Owners read their projects' conversations"
  on public.conversations for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy "Owners read their projects' messages"
  on public.messages for select to authenticated
  using (conversation_id in (select public.owned_conversation_ids()));

-- ---------------------------------------------------------------------------
-- Grants (project.md §9). Supabase's default privileges gave every API role
-- ALL on these tables and EXECUTE on these functions; take it all back, then
-- grant only what the roles table in §7 allows.
-- ---------------------------------------------------------------------------

revoke all on table
  public.accounts,
  public.projects,
  public.widget_configs,
  public.knowledge_sources,
  public.knowledge_chunks,
  public.conversations,
  public.messages
from public, anon, authenticated, service_role;

grant select on table
  public.accounts,
  public.projects,
  public.widget_configs,
  public.knowledge_sources,
  public.knowledge_chunks,
  public.conversations,
  public.messages
to authenticated;

grant update (name) on table public.projects to authenticated;
grant delete on table public.projects to authenticated;

-- Everything except TRUNCATE. MAINTAIN needs Postgres 17+ (dev runs 17.11).
grant select, insert, update, delete, references, trigger, maintain on table
  public.accounts,
  public.projects,
  public.widget_configs,
  public.knowledge_sources,
  public.knowledge_chunks,
  public.conversations,
  public.messages
to service_role;

revoke execute on function public.owned_project_ids() from public, anon, service_role;
revoke execute on function public.owned_conversation_ids() from public, anon, service_role;
grant execute on function public.owned_project_ids() to authenticated;
grant execute on function public.owned_conversation_ids() to authenticated;

-- Future objects that postgres creates in public give anon and authenticated
-- nothing by default. Each migration grants what a role needs explicitly.
-- (Undoes Supabase's per-schema default grants for postgres.)
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
-- Postgres grants EXECUTE on every new function to PUBLIC (which anon and
-- authenticated inherit). A per-schema revoke can't undo that built-in
-- default, so this one is global for functions postgres creates.
--
-- IMPORTANT for later migrations: because this is global, it covers every
-- function postgres creates from now on, in ANY schema, including functions
-- that a later `create extension` creates when it runs as postgres. Nobody
-- gets EXECUTE on them by default. Every function or extension added later
-- must grant EXECUTE explicitly to the roles that need it (e.g.
-- `grant execute on function public.match_chunks(...) to service_role`).
alter default privileges for role postgres
  revoke execute on functions from public;
