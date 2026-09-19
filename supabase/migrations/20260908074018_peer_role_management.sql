-- Same-role accounts cannot manage each other.
--
-- The rule: an account may change another account's role, permissions, hospital
-- assignments or profile only when its own role outranks the target's — master
-- (3) over admin (2) over user/staff (1). Equal ranks never qualify, and an
-- account holds the same rank as itself, so this also ends self-management
-- through the admin screens: an admin can no longer grant itself can_scan, and
-- a master can no longer demote or disable itself.
--
-- What it closes beyond peer-on-peer edits:
--
--   * "user_permissions: admins manage" carried no rank test at all, so any
--     admin could disable a *master's* account straight over the REST API.
--     UserManagement.tsx hid masters from admins; RLS did not.
--   * "user_roles: masters manage" let one master demote another.
--   * "profiles: admins update all" let an admin rewrite a master's name.
--
-- Promotion still works, because rank is read from the target's *current* role:
-- a master may raise a user to master, creating a peer it can no longer touch.
-- That is also why UserManagement.tsx now writes hospitals and permissions
-- BEFORE the role change — after it, the target is out of the writer's reach.
--
-- The consequence to know about: nobody can provision a master. A master's own
-- row and a peer master's row are both unreachable now, so a new master has to
-- be enabled and assigned its hospitals *while it is still a user or admin*,
-- and promoted last.

-- ─── rank ───────────────────────────────────────────────────────────────────
-- 'staff' and 'user' share a rank: get_user_role() returns either one
-- (handle_new_user() inserts 'user', UserManagement.tsx inserts 'staff') and
-- both mean standard staff. Anything unrecognised ranks 0, below every real
-- role, so a future app_role member cannot silently arrive with authority.
create or replace function public.role_rank(_role text)
returns integer language sql immutable set search_path = '' as $$
  select case _role
    when 'master' then 3
    when 'admin'  then 2
    when 'staff'  then 1
    when 'user'   then 1
    else 0
  end;
$$;

-- SECURITY DEFINER for the reason every other helper here is: it reads
-- user_roles from inside a policy *on* user_roles, and definer rights are what
-- keep that read from re-entering the policy and recursing.
create or replace function public.can_manage_user(_actor_id uuid, _target_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select _actor_id is not null
     and _target_user_id is not null
     and public.role_rank(public.get_user_role(_actor_id))
       > public.role_rank(public.get_user_role(_target_user_id));
$$;

-- ─── user_roles ─────────────────────────────────────────────────────────────
-- Role writes stay master-only — an admin able to grant 'admin' would be
-- minting peers it then cannot manage — and now also require the target to be
-- outranked. UserManagement.tsx changes a role by deleting the existing rows
-- and inserting one, and both halves pass: the DELETE is checked against the
-- target's current role, and by the INSERT the target holds none, so
-- get_user_role() reads its 'user' fallback. An account already holding
-- 'master' is unreachable from either side — its row cannot be deleted, and no
-- second row can be inserted beside it.
drop policy if exists "user_roles: masters manage" on public.user_roles;

create policy "user_roles: masters manage lower ranks"
  on public.user_roles for all to authenticated
  using (
    public.is_master((select auth.uid()))
    and public.can_manage_user((select auth.uid()), user_id)
  )
  with check (
    public.is_master((select auth.uid()))
    and public.can_manage_user((select auth.uid()), user_id)
  );

-- ─── user_permissions ───────────────────────────────────────────────────────
drop policy if exists "user_permissions: admins manage" on public.user_permissions;

create policy "user_permissions: admins manage lower ranks"
  on public.user_permissions for all to authenticated
  using (
    public.is_admin_or_higher((select auth.uid()))
    and public.can_manage_user((select auth.uid()), user_id)
  )
  with check (
    public.is_admin_or_higher((select auth.uid()))
    and public.can_manage_user((select auth.uid()), user_id)
  );

-- ─── hospital_assignments ───────────────────────────────────────────────────
-- Keeps the hospital test that stops an admin at one hospital reaching staff at
-- another, and adds the rank test on top of it.
drop policy if exists "hospital_assignments: admins manage shared" on public.hospital_assignments;

create policy "hospital_assignments: admins manage lower ranks"
  on public.hospital_assignments for all to authenticated
  using (
    public.is_admin_or_higher((select auth.uid()))
    and public.admin_has_hospital((select auth.uid()), hospital)
    and public.can_manage_user((select auth.uid()), user_id)
  )
  with check (
    public.is_admin_or_higher((select auth.uid()))
    and public.admin_has_hospital((select auth.uid()), hospital)
    and public.can_manage_user((select auth.uid()), user_id)
  );

-- Deleting a hospital cleared its assignments from the client
-- (HospitalManagement.tsx, master-only), which can no longer reach a peer
-- master's row or its own. A DELETE narrowed by RLS removes fewer rows in
-- silence rather than failing, so those assignments would outlive the hospital
-- they name and keep showing up in useRole()'s assignedHospitals. Hospital
-- deletion is a hospital-level operation, not user management, so the cleanup
-- moves into the database, where the rank rule does not apply.
create or replace function public.cleanup_hospital_assignments()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.hospital_assignments where hospital = old.name;
  return old;
end;
$$;

drop trigger if exists hospitals_cleanup_assignments on public.hospitals;
create trigger hospitals_cleanup_assignments
  after delete on public.hospitals
  for each row execute function public.cleanup_hospital_assignments();

-- ─── profiles ───────────────────────────────────────────────────────────────
-- Editing your own profile is untouched: that is "profiles: update own", which
-- is the policy Onboarding.tsx writes through.
drop policy if exists "profiles: admins update all" on public.profiles;

create policy "profiles: admins update lower ranks"
  on public.profiles for update to authenticated
  using (
    public.is_admin_or_higher((select auth.uid()))
    and public.can_manage_user((select auth.uid()), id)
  )
  with check (
    public.is_admin_or_higher((select auth.uid()))
    and public.can_manage_user((select auth.uid()), id)
  );

-- Reads are deliberately unchanged. A master still sees its peers in the user
-- list and an admin still sees the staff it cannot edit; the rule is about who
-- may change an account, not who may see one.

-- ─── grants ─────────────────────────────────────────────────────────────────
-- Per 20260830120700: a new function in `public` inherits EXECUTE from both
-- PUBLIC and Supabase's default privileges, so each needs its own revoke naming
-- both. can_manage_user() answers questions about real accounts and is called
-- from policies, so `authenticated` keeps it and `anon` loses it. The trigger
-- function is privilege-checked at CREATE TRIGGER rather than when it fires, so
-- it needs no grant at all.
revoke execute on function public.role_rank(text) from public, anon;
grant  execute on function public.role_rank(text) to authenticated;
revoke execute on function public.can_manage_user(uuid, uuid) from public, anon;
grant  execute on function public.can_manage_user(uuid, uuid) to authenticated;
revoke execute on function public.cleanup_hospital_assignments() from public, anon, authenticated;
