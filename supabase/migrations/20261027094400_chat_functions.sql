-- SB-T11: the chat route's atomic steps as Postgres functions, called with supabase.rpc() by our
-- server (service_role). Same security model as the baseline: service_role only, SET search_path
-- = '' with fully-qualified names, SECURITY INVOKER (service_role already holds the table grants
-- it needs, so no privilege escalation is required).

-- add_one_month --------------------------------------------------------------------------------
-- Ports apps/web/lib/data/usage.ts's addOneMonth: same day next month, clamped to the month's
-- last day (Jan 31 -> Feb 28/29, not Mar 3), preserving the time of day. All arithmetic is in UTC
-- wall-clock terms, same as the TS version's setUTCDate/getUTCMonth/etc. A standalone, pure
-- function so its date math can be tested directly, not just through consume_message's reset
-- decision.
CREATE FUNCTION public.add_one_month(ts timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (
    date_trunc('month', naive) + interval '1 month'
    + (least(
        extract(day FROM naive)::int,
        extract(day FROM (date_trunc('month', naive) + interval '2 month' - interval '1 day'))::int
      ) - 1) * interval '1 day'
    + (naive - date_trunc('day', naive))
  ) AT TIME ZONE 'UTC'
  FROM (SELECT ts AT TIME ZONE 'UTC' AS naive) AS t;
$$;

-- consume_message ----------------------------------------------------------------------------
-- Replaces lib/chat's usedThisPeriod() (period reset) and the save transaction's conditional
-- `messages_used + 1`. One atomic call: locks the project row, resets the period if it's a month
-- old, increments only while under the limit, and reports whether it counted. Same refusal
-- convention as SB-T03 (bob/SB-T03-limit-functions): AWNOP for no such project, 22023 for a null
-- or negative limit (a server bug, never a user error). At the limit itself, this just returns
-- false rather than raising AWLIM — the chat route's "quota exceeded" reply is a normal response,
-- not an error path, unlike create_project/reserve_knowledge_source which abort a write.
CREATE FUNCTION public.consume_message(p_project_id uuid, p_message_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_period_start timestamptz;
  v_messages_used integer;
  v_now timestamptz := now();
BEGIN
  IF p_message_limit IS NULL OR p_message_limit < 0 THEN
    RAISE EXCEPTION 'message limit must be a non-negative integer, got %', p_message_limit
      USING ERRCODE = '22023';
  END IF;

  SELECT period_start, messages_used INTO v_period_start, v_messages_used
  FROM public.projects WHERE id = p_project_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project % not found', p_project_id USING ERRCODE = 'AWNOP';
  END IF;

  IF public.add_one_month(v_period_start) <= v_now THEN
    UPDATE public.projects SET messages_used = 0, period_start = v_now WHERE id = p_project_id;
    v_messages_used := 0;
  END IF;

  IF v_messages_used >= p_message_limit THEN
    RETURN false;
  END IF;

  UPDATE public.projects SET messages_used = messages_used + 1 WHERE id = p_project_id;
  RETURN true;
END;
$$;

-- save_chat_turn ------------------------------------------------------------------------------
-- Replaces lib/chat's save transaction. Locks the project row (first_chat must still be decided
-- under a per-project lock, as in #77, even though the quota no longer lives in this function);
-- creates the conversation when none is given, refusing a conversation_id that belongs to another
-- project (or none) with AWNOC (not one of SB-T03's codes, since that's a different kind of
-- refusal than "limit" or "no such project"); saves both messages; returns the conversation id
-- and whether this was the project's first conversation.
CREATE FUNCTION public.save_chat_turn(
  p_project_id uuid,
  p_conversation_id uuid,
  p_visitor_id text,
  p_question text,
  p_reply text,
  p_asked_at timestamptz,
  p_replied_at timestamptz
)
RETURNS TABLE (conversation_id uuid, first_chat boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_conversation_id uuid;
  v_first_chat boolean := false;
BEGIN
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project % not found', p_project_id USING ERRCODE = 'AWNOP';
  END IF;

  IF p_conversation_id IS NOT NULL THEN
    SELECT c.id INTO v_conversation_id
    FROM public.conversations c WHERE c.id = p_conversation_id AND c.project_id = p_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'conversation % not found', p_conversation_id USING ERRCODE = 'AWNOC';
    END IF;
  ELSE
    -- Under the row lock, any earlier save has committed, so this sees every conversation:
    -- exactly one call can find none and create the project's first.
    SELECT NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.project_id = p_project_id) INTO v_first_chat;
    INSERT INTO public.conversations (project_id, visitor_id) VALUES (p_project_id, p_visitor_id)
      RETURNING id INTO v_conversation_id;
  END IF;

  INSERT INTO public.messages (conversation_id, role, body, created_at) VALUES
    (v_conversation_id, 'visitor', p_question, p_asked_at),
    (v_conversation_id, 'bot', p_reply, p_replied_at);

  RETURN QUERY SELECT v_conversation_id, v_first_chat;
END;
$$;

-- match_chunks --------------------------------------------------------------------------------
-- Replaces packages/db/queries/chunks.ts's searchChunks. Cosine distance through the HNSW index,
-- one project only. Unlike today's query, also requires the chunk's source to be `ready`: L8
-- (docs/security-review.md) stops the embedding call for a project with zero ready chunks, but
-- searchChunks itself never filtered by source status, so a project with both a ready and a
-- processing/failed source could still retrieve the latter's chunks. Filtering here closes that.
-- A null or non-positive p_match_count would otherwise reach LIMIT as LIMIT NULL (every row) or
-- LIMIT 0/negative silently, so it's guarded the same way as SB-T03's limit parameters: 22023.
CREATE FUNCTION public.match_chunks(
  p_project_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer
)
RETURNS TABLE (content text, distance double precision)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_match_count IS NULL OR p_match_count < 1 THEN
    RAISE EXCEPTION 'match count must be a positive integer, got %', p_match_count
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT kc.content, (kc.embedding OPERATOR(extensions.<=>) p_query_embedding)::double precision AS distance
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_sources ks ON ks.id = kc.source_id
  WHERE kc.project_id = p_project_id AND ks.status = 'ready'
  ORDER BY kc.embedding OPERATOR(extensions.<=>) p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- Grants ----------------------------------------------------------------------------------------
-- Limits (message_limit) and counts (match_count) come in as parameters from our server, which
-- reads PLAN_LIMITS / RETRIEVAL_TOP_K from packages/shared: one source of truth. So EXECUTE is
-- service_role only; an owner's own token can't call these with a bigger limit. add_one_month is
-- pure date math with nothing sensitive to leak, but stays revoked too for the same default-deny
-- consistency as every other function here; consume_message (SECURITY INVOKER, so it calls
-- add_one_month as whichever role invoked it) needs service_role granted on it directly.
REVOKE ALL ON FUNCTION public.add_one_month(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_message(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_chat_turn(uuid, uuid, text, text, text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_chunks(uuid, extensions.vector, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.add_one_month(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_message(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_chat_turn(uuid, uuid, text, text, text, timestamptz, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.match_chunks(uuid, extensions.vector, integer) TO service_role;
