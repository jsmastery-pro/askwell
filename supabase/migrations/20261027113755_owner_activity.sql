-- SB-T04: the dashboard's activity numbers for the signed-in owner, computed in the database.
-- PostgREST can't group or count distinct values unless aggregates are turned on project-wide,
-- and it returns at most 1,000 rows, so fetching the messages to count them in TypeScript would
-- silently undercount a busy owner.
--
-- SECURITY INVOKER and no owner parameter: it runs as the caller (`authenticated`, with their
-- Clerk token), so RLS limits it to messages in the caller's own projects. Nothing a caller
-- passes can widen that. Only `authenticated` may execute it; service_role would see every
-- owner's rows, so it doesn't get it either.
--
-- Returns one row for messages created in [p_start, p_end]:
--   messages       the number of messages
--   conversations  distinct conversations with at least one of those messages
--   visitors       distinct visitors across those conversations
--   daily          {"YYYY-MM-DD": count}, by UTC day, days without messages left out
-- Raises 22023 for a missing bound, p_end before p_start, or a range over 366 days.

CREATE FUNCTION public.owner_activity(p_start timestamptz, p_end timestamptz)
RETURNS TABLE (messages integer, conversations integer, visitors integer, daily jsonb)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'activity range must have a start before its end, got % to %', p_start, p_end
      USING ERRCODE = '22023';
  END IF;
  IF p_end - p_start > interval '366 days' THEN
    RAISE EXCEPTION 'activity range is over 366 days (% to %)', p_start, p_end
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH in_range AS (
    SELECT m.created_at, m.conversation_id, c.visitor_id
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.created_at >= p_start AND m.created_at <= p_end
  )
  SELECT
    count(*)::integer,
    count(DISTINCT r.conversation_id)::integer,
    count(DISTINCT r.visitor_id)::integer,
    coalesce(
      (SELECT jsonb_object_agg(d.day, d.n)
       FROM (
         SELECT to_char(x.created_at AT TIME ZONE 'utc', 'YYYY-MM-DD') AS day, count(*) AS n
         FROM in_range x
         GROUP BY 1
       ) d),
      '{}'::jsonb
    )
  FROM in_range r;
END;
$$;

-- Postgres grants EXECUTE to PUBLIC on new functions, and Supabase's default privileges add the
-- API roles: revoke them all, then grant authenticated explicitly.
REVOKE EXECUTE ON FUNCTION public.owner_activity(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_activity(timestamptz, timestamptz) TO authenticated;
