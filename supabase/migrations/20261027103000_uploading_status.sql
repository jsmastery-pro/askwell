-- SB-T06: a file reservation now sits as `uploading` until the browser's signed PUT lands and
-- finalize claims it; only then does it become `processing` (the same status pasted text starts
-- at, since it has no upload step). Without a distinct status, finalize couldn't tell "mid-ingest,
-- already running" apart from "upload never finished", and a second call to finalize while the
-- row was still `processing` would re-embed the file on our OpenAI key.
--
-- Additive: ALTER TYPE ... ADD VALUE can't run in the same transaction as a statement that *uses*
-- the new value, but CREATE OR REPLACE FUNCTION only stores the plpgsql body — the literal
-- 'uploading' inside it is checked the next time the function runs, not now — so one migration
-- file is enough.
ALTER TYPE public.source_status ADD VALUE 'uploading';

-- Same signature as SB-T03's version (supabase/migrations/20261027094113_limit_functions.sql):
-- CREATE OR REPLACE keeps its existing grants, so nothing needs re-granting. Only the status it
-- inserts changes: `uploading` for a file reservation (it has a storage key waiting to be
-- uploaded), `processing` for pasted text (there's nothing left to upload).
CREATE OR REPLACE FUNCTION public.reserve_knowledge_source(
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
  VALUES (
    coalesce(p_source_id, gen_random_uuid()),
    p_project_id,
    p_title,
    p_type,
    p_storage_key,
    (CASE WHEN p_storage_key IS NOT NULL THEN 'uploading' ELSE 'processing' END)::public.source_status
  )
  RETURNING * INTO source;

  RETURN source;
END;
$$;
