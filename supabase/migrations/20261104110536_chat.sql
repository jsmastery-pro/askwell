-- ---------------------------------------------------------------------------
-- Chat, database side (project.md §6.6, §6.12, §7, §9).
--
-- 1. consume_message(): counts one visitor message against the monthly quota.
-- 2. save_chat_turn(): saves the visitor message + bot reply, creating the
--    conversation on the first message.
-- 3. match_chunks(): the top matching chunks of this project's ready sources.
--
-- All three: SECURITY INVOKER, search_path = '', EXECUTE for service_role only
-- (the chat route calls them with the service client after resolving the
-- public key to a project).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. consume_message()
--
-- Runs before any OpenAI call (§6.6 step 3). Under a row lock on the project:
--   a. If period_start is a month or more ago, start a new period: reset
--      messages_used to 0 and set period_start = now() (a rolling month from
--      period_start; product decision).
--   b. If messages_used < p_max_messages, count the message.
-- Returns one row: allowed (was it counted) and messages_used after the call.
-- The lock makes two parallel calls at limit - 1 serialize: one wins.
--
-- Errors the route maps (stable; match on SQLSTATE + message):
--   SQLSTATE P0002, message 'project_not_found'    -> the project does not exist
--   SQLSTATE 22023, message 'invalid_max_messages' -> p_max_messages null or < 0 (a server bug)
--
-- p_max_messages comes from PLAN_LIMITS[plan].messagesPerMonth in
-- packages/shared, for the plan the route read on the server (§5).
-- ---------------------------------------------------------------------------

create function public.consume_message(
  p_project_id uuid,
  p_max_messages integer
)
returns table (
  allowed boolean,
  messages_used integer
)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_used integer;
  v_period_start timestamptz;
  v_allowed boolean;
begin
  if p_max_messages is null or p_max_messages < 0 then
    raise exception using errcode = '22023', message = 'invalid_max_messages';
  end if;

  -- Serialize every consume for this project on its row.
  select p.messages_used, p.period_start into v_used, v_period_start
  from public.projects p
  where p.id = p_project_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'project_not_found';
  end if;

  if v_period_start + interval '1 month' <= now() then
    v_used := 0;
    v_period_start := now();
  end if;

  v_allowed := v_used < p_max_messages;
  if v_allowed then
    v_used := v_used + 1;
  end if;

  update public.projects p
  set messages_used = v_used, period_start = v_period_start
  where p.id = p_project_id;

  return query select v_allowed, v_used;
end;
$$;

revoke execute on function public.consume_message(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_message(uuid, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. save_chat_turn()
--
-- p_conversation_id null -> creates a conversation for (project, visitor).
-- Otherwise the conversation must belong to p_project_id (§6.6 step 2), or it
-- raises conversation_not_found and saves nothing.
-- Inserts the visitor message, then the bot reply 1 microsecond later, so the
-- reply always sorts after the message. Returns the conversation ID.
--
-- Errors the route maps (stable; match on SQLSTATE + message):
--   SQLSTATE P0002, message 'conversation_not_found' -> 404 not_found
--   SQLSTATE 23503 (foreign_key_violation) on conversations_project_id_fkey
--     -> the project does not exist (a server bug: the route resolved it)
-- ---------------------------------------------------------------------------

create function public.save_chat_turn(
  p_project_id uuid,
  p_conversation_id uuid,
  p_visitor_id text,
  p_visitor_message text,
  p_bot_reply text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid := p_conversation_id;
  v_at timestamptz;
begin
  if v_conversation_id is null then
    insert into public.conversations (project_id, visitor_id)
    values (p_project_id, p_visitor_id)
    returning id into v_conversation_id;
  else
    perform 1 from public.conversations c
    where c.id = v_conversation_id and c.project_id = p_project_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'conversation_not_found';
    end if;
  end if;

  -- The reply is stamped 1 microsecond after the message, so it always sorts
  -- after it, even where two clock reads return the same value.
  v_at := clock_timestamp();
  insert into public.messages (conversation_id, role, body, created_at)
  values (v_conversation_id, 'visitor', p_visitor_message, v_at);
  insert into public.messages (conversation_id, role, body, created_at)
  values (v_conversation_id, 'bot', p_bot_reply, v_at + interval '1 microsecond');

  return v_conversation_id;
end;
$$;

revoke execute on function public.save_chat_turn(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_chat_turn(uuid, uuid, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. match_chunks()
--
-- The p_count chunks of p_project_id's 'ready' sources closest to p_embedding
-- by cosine distance, with similarity (1 - distance) >= p_min_similarity,
-- nearest first. Never another project's chunks (§9 "chunk search is scoped
-- to one project"), never a source still processing or failed.
--
-- Ordered by `embedding <=> p_embedding` with a LIMIT, so the planner can use
-- the HNSW index (knowledge_chunks_embedding_idx). The project filter runs on
-- the index's candidates; hnsw.iterative_scan = strict_order (pgvector >= 0.8)
-- keeps scanning until p_count rows pass it, instead of returning too few when
-- most near neighbours belong to other projects. Order stays exact.
--
-- Errors (stable):
--   SQLSTATE 22023, message 'invalid_match_count' -> p_count null or not 1-50 (a server bug)
-- p_count is MATCH_COUNT and p_min_similarity MIN_MATCH_SIMILARITY in packages/shared.
-- ---------------------------------------------------------------------------

-- Load pgvector's library in this session before creating match_chunks.
-- hnsw.iterative_scan is only defined once the library is loaded; until then
-- Postgres treats it as an unknown placeholder, and a function SET clause on a
-- placeholder needs superuser. Migrations on Supabase don't run as superuser,
-- so without this line the CREATE fails with "permission denied to set
-- parameter". This line was added to the merged file before it was applied
-- anywhere (one-time exception, approved by the lead).
select '[1]'::extensions.vector;

create function public.match_chunks(
  p_project_id uuid,
  p_embedding extensions.vector(1536),
  p_count integer,
  p_min_similarity double precision
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  similarity double precision
)
language plpgsql
stable
security invoker
set search_path = ''
set hnsw.iterative_scan = strict_order
as $$
#variable_conflict use_column
begin
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception using errcode = '22023', message = 'invalid_match_count';
  end if;

  return query
  select
    c.id,
    c.source_id,
    c.content,
    1 - (c.embedding operator(extensions.<=>) p_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s
    on s.id = c.source_id and s.project_id = c.project_id
  where c.project_id = p_project_id
    and s.status = 'ready'
    and c.embedding operator(extensions.<=>) p_embedding <= 1 - coalesce(p_min_similarity, -1)
  order by c.embedding operator(extensions.<=>) p_embedding
  limit p_count;
end;
$$;

revoke execute on function public.match_chunks(uuid, extensions.vector, integer, double precision)
  from public, anon, authenticated;
grant execute on function public.match_chunks(uuid, extensions.vector, integer, double precision)
  to service_role;
