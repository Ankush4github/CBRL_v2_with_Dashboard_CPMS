-- Take back the blanket table grants that left RLS as the only barrier.
--
-- Supabase's defaults give anon and authenticated every privilege on every
-- table in public — SELECT through TRUNCATE — and the schema's default
-- privileges hand the same to every table and function created later. RLS
-- caught every case today, but one permissive policy written by mistake would
-- have been reachable without signing in.
--
-- After this:
--   - anon holds SELECT on site_content (the public website) and nothing else
--     in public. Nothing else is read before sign-in.
--   - authenticated keeps SELECT/INSERT/UPDATE/DELETE, still governed by RLS,
--     but loses TRUNCATE, TRIGGER and REFERENCES, which no client uses and RLS
--     does not cover (TRUNCATE ignores it entirely).
--   - authenticated's column-level grants (patient_records.diagnosis,
--     attendance_records' check-in and check-out columns) are untouched. A
--     table-level REVOKE also revokes that privilege on every column, but
--     nothing here revokes SELECT, INSERT, UPDATE or DELETE from
--     authenticated. anon loses its column grants too, which is the point.
--   - New tables stop being granted to anon; new functions stop being
--     executable by anon and PUBLIC. A migration that adds an RPC must now
--     grant EXECUTE to authenticated itself — the explicit default for
--     authenticated still does that for functions created by postgres.
--
-- Also clears the advisor's lints 0028/0029: the two trigger functions below
-- were executable by PUBLIC. Postgres refuses to call a trigger function
-- directly, so that was never exploitable, only noise.
--
-- Safe to run twice.

do $$
declare
  t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke all on table public.%I from anon', t.tablename);
    execute format(
      'revoke truncate, trigger, references on table public.%I from authenticated',
      t.tablename
    );
  end loop;
end
$$;

grant select on table public.site_content to anon;

-- New objects created by postgres (migrations, the SQL editor).
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
-- PUBLIC's EXECUTE on new functions is a global default, not a per-schema one,
-- so it is revoked without IN SCHEMA. It applies only to functions created by
-- postgres; Supabase's own (owned by supabase_admin) are unaffected.
alter default privileges for role postgres
  revoke execute on functions from public;

revoke all on function public.patient_records_audit() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
