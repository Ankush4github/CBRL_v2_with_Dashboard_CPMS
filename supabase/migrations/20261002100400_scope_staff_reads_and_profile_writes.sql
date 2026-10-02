-- Three tightenings from the 2026-10-02 audit. Safe to run twice.
--
-- 1. Admins see only the staff they share a hospital with, plus unassigned
--    accounts (the approval queue).
--
--    "admins read all" on profiles, user_roles and user_permissions let an
--    admin at one hospital read every account's name, email, role and enabled
--    state at every other. Everything else admins see — attendance, deletions,
--    invitations, assignments — was already scoped to their hospitals. User
--    Management fetched the lot and filtered it in the browser, which hid the
--    rows on screen but not in the response.
--
--    The check needs a SECURITY DEFINER helper: "has no assignments" tested
--    from inside a policy would see hospital_assignments through the admin's
--    own RLS, and every account at a hospital the admin cannot see would look
--    unassigned — exactly the accounts this is meant to hide.
--
-- 2. A user may change only the profile fields Onboarding sets.
--
--    "profiles: update own" came with UPDATE on email, full_name, id and the
--    timestamps. profiles.email is where attendance reminders and ops alerts
--    are sent, and email/full_name are how admin screens and the audit trail
--    name a person — so anyone could redirect their mail or appear as someone
--    else. Both come from the Google account at sign-up (handle_new_user).
--
-- 3. Only masters may delete prescription files outright.
--
--    Admins could delete the source image of any record at their hospitals;
--    the record kept pointing at a missing file and nothing logged it. Record
--    deletion — masters only, and logged in patient_record_deletions — is the
--    path for removing clinical documents. Uploaders keep deleting their own
--    files while nothing references them (a cancelled scan).

-- 1 -------------------------------------------------------------------------

create or replace function public.admin_may_see_user(_admin_id uuid, _target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin_or_higher(_admin_id)
     and (
       public.admin_shares_hospital_with_user(_admin_id, _target_user_id)
       or not exists (
         select 1 from public.hospital_assignments where user_id = _target_user_id
       )
     );
$$;

revoke all on function public.admin_may_see_user(uuid, uuid) from public, anon;
grant execute on function public.admin_may_see_user(uuid, uuid) to authenticated;

drop policy if exists "profiles: admins read all" on public.profiles;
drop policy if exists "profiles: admins read their staff" on public.profiles;
create policy "profiles: admins read their staff"
  on public.profiles for select to authenticated
  using (public.admin_may_see_user((select auth.uid()), id));

drop policy if exists "user_roles: admins read all" on public.user_roles;
drop policy if exists "user_roles: admins read their staff" on public.user_roles;
create policy "user_roles: admins read their staff"
  on public.user_roles for select to authenticated
  using (public.admin_may_see_user((select auth.uid()), user_id));

drop policy if exists "user_permissions: admins read all" on public.user_permissions;
drop policy if exists "user_permissions: admins read their staff" on public.user_permissions;
create policy "user_permissions: admins read their staff"
  on public.user_permissions for select to authenticated
  using (public.admin_may_see_user((select auth.uid()), user_id));

-- 2 -------------------------------------------------------------------------

-- A table-level REVOKE also removes the privilege from every column, which
-- clears the old column list before the narrow one is granted.
revoke update on table public.profiles from authenticated;
grant update (clinic_name, staff_role, onboarding_completed)
  on public.profiles to authenticated;

-- 3 -------------------------------------------------------------------------

drop policy if exists "prescriptions: admins delete" on storage.objects;
drop policy if exists "prescriptions: masters delete" on storage.objects;
create policy "prescriptions: masters delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'prescriptions'
    and public.is_master((select auth.uid()))
    and public.user_is_enabled((select auth.uid()))
    and public.prescription_object_is_readable(name, (select auth.uid()))
  );
