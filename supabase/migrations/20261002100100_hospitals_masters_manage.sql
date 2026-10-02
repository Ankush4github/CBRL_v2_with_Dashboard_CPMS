-- Only masters may create, change or delete hospitals.
--
-- "hospitals: admins manage" let any admin write any hospital: rename it
-- (which orphans its patient records and assignments, joined by name), move
-- its geofence or hours, or delete it — and the delete trigger
-- cleanup_hospital_assignments then removes every staff assignment there. An
-- admin at hospital A could do all of that to hospital B.
--
-- Hospital Management is already a master-only screen (RoleRoute
-- requires="master"), so this makes the database match what the app offers.
-- Admins keep reading hospitals through "hospitals: read".
--
-- Safe to run twice.

drop policy if exists "hospitals: admins manage" on public.hospitals;
drop policy if exists "hospitals: masters manage" on public.hospitals;

create policy "hospitals: masters manage"
  on public.hospitals
  for all
  to authenticated
  using (
    public.is_master((select auth.uid()))
    and public.user_is_enabled((select auth.uid()))
  )
  with check (
    public.is_master((select auth.uid()))
    and public.user_is_enabled((select auth.uid()))
  );
