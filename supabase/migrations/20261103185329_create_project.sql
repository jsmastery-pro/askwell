-- create_project(): the plan-limited way to create a project (project.md §6.3,
-- §7 "Limits run inside Postgres functions only service_role may execute").
--
-- It checks the limit and writes under a row lock on the owner's account, so
-- two parallel requests for the same owner can't both pass the limit: the
-- second waits for the first to commit, then counts its project.
--
-- Errors the route maps (stable; match on SQLSTATE + message, not text around it):
--   SQLSTATE P0001, message 'plan_limit_reached'  -> 403 plan_limit_reached
--   SQLSTATE P0002, message 'account_not_found'   -> the owner has no accounts row
--   SQLSTATE 22023, message 'invalid_max_projects' -> p_max_projects is null or < 0 (a server bug)
--   SQLSTATE 23505 (unique_violation) on projects_public_key_key -> public key collision; retry with a new key
--   SQLSTATE 23514 (check_violation) on projects_name_check      -> name not 1-60 characters
--
-- p_max_projects comes from PLAN_LIMITS in packages/shared, for the plan the
-- route read on the server (§5: plan limits live in one place).

create function public.create_project(
  p_owner_id text,
  p_name text,
  p_public_key text,
  p_max_projects integer
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project public.projects;
  v_count integer;
begin
  if p_max_projects is null or p_max_projects < 0 then
    raise exception using errcode = '22023', message = 'invalid_max_projects';
  end if;

  -- Serialize every create for this owner on their account row.
  perform 1 from public.accounts where clerk_user_id = p_owner_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'account_not_found';
  end if;

  select count(*) into v_count from public.projects where owner_id = p_owner_id;
  if v_count >= p_max_projects then
    raise exception using errcode = 'P0001', message = 'plan_limit_reached';
  end if;

  insert into public.projects (owner_id, name, public_key)
  values (p_owner_id, p_name, p_public_key)
  returning * into v_project;

  -- Every project has a config row; its column defaults equal DEFAULT_WIDGET_CONFIG.
  insert into public.widget_configs (project_id) values (v_project.id);

  return v_project;
end;
$$;

-- Only the server (service_role) may call it (§7, §9 "Database API"). The
-- initial migration already stopped new functions from granting EXECUTE to
-- PUBLIC; revoke explicitly anyway, then grant to service_role only.
revoke execute on function public.create_project(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.create_project(text, text, text, integer)
  to service_role;
