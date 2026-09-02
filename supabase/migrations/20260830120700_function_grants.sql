-- Narrow EXECUTE on the SECURITY DEFINER helpers to the roles that need them.
--
-- Not part of the reconstruction: this closes a gap the reconstruction opened.
-- The database linter flags every function in 20260830120000..120600 under
-- 0028_anon_security_definer_function_executable, and it is right to.
--
-- ## Why the grants are there at all
--
-- Two separate grants reach `anon`, and BOTH have to go:
--
--   1. PostgreSQL's own default. A new function is EXECUTE-able by PUBLIC, and
--      every role is a member of PUBLIC. In pg_proc.proacl this is the entry
--      with an empty grantee, `=X/postgres`.
--   2. Supabase ships `alter default privileges in schema public grant execute
--      on functions to anon, authenticated, service_role`, so each of those
--      three also picks up a *direct* grant on creation.
--
-- Revoking from `anon` alone removes only (2) and leaves (1) in place, which
-- changes nothing: has_function_privilege('anon', ...) still returns true
-- through PUBLIC. Revoking from `public` alone leaves (2). Both must be named.
-- Compare is_site_editor in 20260830120500, whose ACL has no `=X/` entry —
-- that is what a correctly locked-down function looks like.
--
-- 20260830120500_site_content.sql already does exactly this for is_site_editor,
-- and that one function is the only one the linter does not flag for `anon`.
-- This file applies the same treatment to the other twelve.
--
-- ## What `anon` could otherwise do
--
-- Each helper takes a user id and is reachable at /rest/v1/rpc/<name> with only
-- the publishable key. An anonymous caller holding a user's uuid could read
-- their role off get_user_role(), test their permissions with user_is_enabled()
-- or user_can_scan(), and map staff to hospitals with user_has_hospital_access()
-- and admin_shares_hospital_with_user() — none of which any anonymous visitor
-- has a reason to know. No table data leaks, but the answers are still about
-- real accounts at real hospitals.
--
-- ## Why `authenticated` keeps most of them
--
-- An RLS policy expression is evaluated as the *querying* role, and a function
-- call inside it is a privilege-checked call like any other: revoking EXECUTE
-- from `authenticated` on user_is_enabled() does not fail open, it fails the
-- whole query with `42501: permission denied for function`. Every clinical
-- policy in 120200/120300 would stop working. So the policy helpers keep their
-- `authenticated` grant, and only `anon` loses one.
--
-- Neither of the anon-facing policies calls a function — site_content's is
-- `using (true)` and site-media's is a bare bucket_id test — so `anon` needs
-- EXECUTE on nothing here.

-- ─── policy helpers: anon loses EXECUTE, authenticated keeps it ─────────────

revoke execute on function public.has_role(public.app_role, uuid) from public, anon;
grant  execute on function public.has_role(public.app_role, uuid) to authenticated;
revoke execute on function public.is_master(uuid) from public, anon;
grant  execute on function public.is_master(uuid) to authenticated;
revoke execute on function public.is_admin_or_higher(uuid) from public, anon;
grant  execute on function public.is_admin_or_higher(uuid) to authenticated;
revoke execute on function public.get_user_role(uuid) from public, anon;
grant  execute on function public.get_user_role(uuid) to authenticated;
revoke execute on function public.user_is_enabled(uuid) from public, anon;
grant  execute on function public.user_is_enabled(uuid) to authenticated;
revoke execute on function public.user_can_scan(uuid) from public, anon;
grant  execute on function public.user_can_scan(uuid) to authenticated;
revoke execute on function public.user_has_hospital_access(text, uuid) from public, anon;
grant  execute on function public.user_has_hospital_access(text, uuid) to authenticated;
revoke execute on function public.admin_has_hospital(uuid, text) from public, anon;
grant  execute on function public.admin_has_hospital(uuid, text) to authenticated;
revoke execute on function public.admin_shares_hospital_with_user(uuid, uuid) from public, anon;
grant  execute on function public.admin_shares_hospital_with_user(uuid, uuid) to authenticated;

-- Called over RPC by ScanPrescription.tsx as a signed-in user, so this one is
-- deliberately still reachable by `authenticated` — it is just not anonymous.
revoke execute on function public.generate_reference_number(text) from public, anon;
grant  execute on function public.generate_reference_number(text) to authenticated;

-- ─── trigger functions: nobody calls these directly ────────────────────────
-- PostgreSQL checks EXECUTE on a trigger function when the trigger is created,
-- not when it fires, so removing both grants leaves on_auth_user_created and
-- site_content_snapshot working while taking them off the RPC surface.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.snapshot_site_content() from public, anon, authenticated;

-- Anything added to `public` later inherits the same default grants, so a new
-- SECURITY DEFINER helper needs its own revoke here or it re-opens this.
