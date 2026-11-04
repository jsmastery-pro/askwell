-- Knowledge uploads, database side (project.md §3 File storage, §6.4, §7, §9).
--
-- 1. The private "knowledge" Storage bucket.
-- 2. reserve_knowledge_source(): the plan-limited way to add a source.
-- 3. claim_knowledge_source(): finalize's one-time "uploading" -> "processing".
--
-- Status changes after the claim ("ready", "failed") are plain service-client
-- updates; they need no function.

-- ---------------------------------------------------------------------------
-- 1. Bucket. Private, with the same size and type limits the routes check
-- (MAX_KNOWLEDGE_FILE_BYTES and ALLOWED_FILE_MIME_TYPES in packages/shared;
-- keep them in sync). No storage.objects policies: anon and authenticated
-- can't read or write files; only the service role (which bypasses RLS)
-- signs upload URLs, reads and deletes them.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge',
  'knowledge',
  false,
  10485760,
  array['application/pdf', 'text/markdown', 'text/x-markdown', 'text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. reserve_knowledge_source()
--
-- Checks the limit and inserts under a row lock on the project, so two
-- parallel requests for the same project can't both pass the limit: the
-- second waits for the first to commit, then counts its source.
--
-- Before counting, it deletes this project's "uploading" reservations older
-- than 2 hours (never finalized) and returns their storage keys in
-- reclaimed_storage_keys, so the route can delete any files left in the
-- bucket. Always one row: the new source plus that array (empty if none).
--
-- Two shapes (anything else raises invalid_source):
--   pasted text: type 'text', storage_key null,     status 'processing'
--   file:        type pdf/md/txt, storage_key set,  status 'uploading'
--
-- Errors the route maps (stable; match on SQLSTATE + message):
--   SQLSTATE P0001, message 'plan_limit_reached'  -> 403 plan_limit_reached
--   SQLSTATE P0002, message 'project_not_found'   -> the project does not exist
--   SQLSTATE 22023, message 'invalid_max_sources' -> p_max_sources null or < 0 (a server bug)
--   SQLSTATE 22023, message 'invalid_source'      -> type/storage_key/status don't match a shape above (a server bug)
--   SQLSTATE 23514 (check_violation) on knowledge_sources_type_check -> unknown type
--
-- p_max_sources comes from PLAN_LIMITS[plan].knowledgeSources in
-- packages/shared, for the plan the route read on the server (§5).
-- ---------------------------------------------------------------------------

create function public.reserve_knowledge_source(
  p_project_id uuid,
  p_title text,
  p_type text,
  p_storage_key text,
  p_status text,
  p_max_sources integer
)
returns table (
  id uuid,
  project_id uuid,
  title text,
  type text,
  storage_key text,
  status text,
  created_at timestamptz,
  reclaimed_storage_keys text[]
)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_source public.knowledge_sources;
  v_reclaimed text[];
  v_count integer;
begin
  if p_max_sources is null or p_max_sources < 0 then
    raise exception using errcode = '22023', message = 'invalid_max_sources';
  end if;

  if not (
    (p_type = 'text' and p_storage_key is null and p_status = 'processing')
    or (p_type <> 'text' and p_storage_key is not null and p_status = 'uploading')
  ) then
    raise exception using errcode = '22023', message = 'invalid_source';
  end if;

  -- Serialize every reserve for this project on its row.
  perform 1 from public.projects p where p.id = p_project_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'project_not_found';
  end if;

  -- Reclaim reservations whose upload was never finalized.
  with reclaimed as (
    delete from public.knowledge_sources s
    where s.project_id = p_project_id
      and s.status = 'uploading'
      and s.created_at < now() - interval '2 hours'
    returning s.storage_key
  )
  select coalesce(array_agg(r.storage_key), '{}') into v_reclaimed from reclaimed r;

  select count(*) into v_count
  from public.knowledge_sources s
  where s.project_id = p_project_id;
  if v_count >= p_max_sources then
    raise exception using errcode = 'P0001', message = 'plan_limit_reached';
  end if;

  insert into public.knowledge_sources (project_id, title, type, storage_key, status)
  values (p_project_id, p_title, p_type, p_storage_key, p_status)
  returning * into v_source;

  return query select
    v_source.id,
    v_source.project_id,
    v_source.title,
    v_source.type,
    v_source.storage_key,
    v_source.status,
    v_source.created_at,
    v_reclaimed;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. claim_knowledge_source()
--
-- One statement, so only one caller can move a source from "uploading" to
-- "processing": the first gets the row, every later call (or a call for a
-- source in another project, or one already reclaimed) gets no row. Returns
-- setof so "no row" is an empty result (the route uses .maybeSingle()), not
-- a row of nulls.
-- ---------------------------------------------------------------------------

create function public.claim_knowledge_source(
  p_source_id uuid,
  p_project_id uuid
)
returns setof public.knowledge_sources
language sql
security invoker
set search_path = ''
as $$
  update public.knowledge_sources
  set status = 'processing'
  where id = p_source_id
    and project_id = p_project_id
    and status = 'uploading'
  returning *;
$$;

-- Only the server (service_role) may call them (§7, §9 "Database API").
revoke execute on function public.reserve_knowledge_source(uuid, text, text, text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.claim_knowledge_source(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_knowledge_source(uuid, text, text, text, text, integer)
  to service_role;
grant execute on function public.claim_knowledge_source(uuid, uuid)
  to service_role;
