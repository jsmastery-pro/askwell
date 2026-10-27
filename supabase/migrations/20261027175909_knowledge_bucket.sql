-- SB-T06: the `knowledge` bucket, created here so it exists wherever this migration runs
-- (including production), not just on whoever happens to create it by hand on dev.
--
-- Private: no public access. Supabase enforces file_size_limit and allowed_mime_types on upload,
-- as a second line of defense alongside the server's own checks (declared size, extension, and
-- finalize's real-size + magic-byte check).
--
-- No storage.objects policies for anon or authenticated: every access is either the service_role
-- client (bypasses RLS) or a signed URL, which the Storage API authorizes by its own token, not by
-- a Postgres role. A policy here would only open a door nothing needs.
--
-- The old `askwell` bucket (S3-compatible API, pre-SB-T06) is unrelated and untouched: its objects
-- are throwaway and aren't migrated into this one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge', 'knowledge', false, 10485760, array['application/pdf', 'text/markdown', 'text/plain'])
on conflict (id) do nothing;
