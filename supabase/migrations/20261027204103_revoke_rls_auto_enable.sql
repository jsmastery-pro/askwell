-- SB-T13 (audit S1): public.rls_auto_enable() is Supabase's own event-trigger function, created by
-- the project's "auto-enable RLS" setting, not by our migrations. It's SECURITY DEFINER and
-- PUBLIC, anon and authenticated can all execute it, so it shows up in /rest/v1/rpc (advisor lints
-- 0028/0029). Postgres won't run it outside its event trigger, but nothing should be able to call it.
--
-- Only EXECUTE is revoked: the event trigger still uses the function, so its owner, body and
-- search_path stay as they are. A project without the function (the setting off) skips this.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;
