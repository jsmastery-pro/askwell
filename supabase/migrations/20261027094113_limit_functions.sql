-- SB-T03: the owner-side writes that check a plan limit, as functions the server calls with
-- `supabase.rpc()`. Each one locks a row, counts, and inserts in one transaction, so two
-- concurrent calls can't both pass the count.
--
-- The limit is a parameter: the server reads the owner's plan and passes PLAN_LIMITS from
-- packages/shared, the one source of truth. That's why only service_role (the server's secret
-- key) may execute them; an owner calling with their own token could pass any limit.
--
-- Refusals raise with a known SQLSTATE, which supabase-js returns as `error.code`:
--   AWLIM  the plan's limit is reached; nothing was inserted
--   AWNOP  no such project (reserve_knowledge_source)
--   22023  a limit that is null or negative (a server bug, never a user error)
--
-- SECURITY INVOKER: service_role already has the table privileges and isn't subject to RLS, so
-- nothing needs elevating. The empty search_path still pins every name to its schema.

CREATE FUNCTION public.create_project(
  p_owner_id text,
  p_name text,
  p_public_key text,
  p_project_limit integer
)
RETURNS public.projects
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  project public.projects;
BEGIN
  IF p_project_limit IS NULL OR p_project_limit < 0 THEN
    RAISE EXCEPTION 'project limit must be a non-negative integer, got %', p_project_limit
      USING ERRCODE = '22023';
  END IF;

  -- The dashboard creates the account on first visit, but an API call may come first. Then lock
  -- it: concurrent creates for one owner queue here, so each counts the one before it.
  INSERT INTO public.accounts (clerk_user_id) VALUES (p_owner_id) ON CONFLICT (clerk_user_id) DO NOTHING;
  PERFORM 1 FROM public.accounts WHERE clerk_user_id = p_owner_id FOR UPDATE;

  IF (SELECT count(*) FROM public.projects WHERE owner_id = p_owner_id) >= p_project_limit THEN
    RAISE EXCEPTION 'project limit reached (%)', p_project_limit
      USING ERRCODE = 'AWLIM', DETAIL = p_project_limit::text;
  END IF;

  INSERT INTO public.projects (owner_id, name, public_key)
  VALUES (p_owner_id, p_name, p_public_key)
  RETURNING * INTO project;

  -- Every column default: the widget looks like the app's defaults until the owner saves a config.
  INSERT INTO public.widget_configs (project_id) VALUES (project.id);

  RETURN project;
END;
$$;

-- p_source_id lets the server choose the ID up front: a file's storage key contains it, and the
-- key is stored with the row. Omitted (pasted text), the table's default generates one.
CREATE FUNCTION public.reserve_knowledge_source(
  p_project_id uuid,
  p_title text,
  p_type public.source_type,
  p_storage_key text,
  p_source_limit integer,
  p_source_id uuid DEFAULT NULL
)
RETURNS public.knowledge_sources
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  source public.knowledge_sources;
BEGIN
  IF p_source_limit IS NULL OR p_source_limit < 0 THEN
    RAISE EXCEPTION 'knowledge source limit must be a non-negative integer, got %', p_source_limit
      USING ERRCODE = '22023';
  END IF;

  -- Concurrent adds to one project queue on its row, so each counts the one before it.
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project % not found', p_project_id USING ERRCODE = 'AWNOP';
  END IF;

  -- Files and pasted text count together, whatever their status (project.md §5).
  IF (SELECT count(*) FROM public.knowledge_sources WHERE project_id = p_project_id) >= p_source_limit THEN
    RAISE EXCEPTION 'knowledge source limit reached (%)', p_source_limit
      USING ERRCODE = 'AWLIM', DETAIL = p_source_limit::text;
  END IF;

  INSERT INTO public.knowledge_sources (id, project_id, title, type, storage_key, status)
  VALUES (coalesce(p_source_id, gen_random_uuid()), p_project_id, p_title, p_type, p_storage_key, 'processing')
  RETURNING * INTO source;

  RETURN source;
END;
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase's default privileges add
-- anon and authenticated: revoke all three, then grant service_role explicitly (on new projects
-- the default grants are opt-in, so it may have none).
REVOKE EXECUTE ON FUNCTION
  public.create_project(text, text, text, integer),
  public.reserve_knowledge_source(uuid, text, public.source_type, text, integer, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.create_project(text, text, text, integer),
  public.reserve_knowledge_source(uuid, text, public.source_type, text, integer, uuid)
TO service_role;
