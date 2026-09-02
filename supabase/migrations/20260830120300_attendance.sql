-- Attendance check-in / check-out.
--
-- RECONSTRUCTED — see the header of 20260830120000_core_identity.sql.
-- Absent from the surviving CPMS project (ref nxhqhljijoudmzakqkvh), which
-- predates this feature, so the generated types are the only record of it.

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hospital text not null,

  -- Check-in is mandatory and its coordinates are non-null: a record cannot
  -- exist without the location it was made from.
  check_in_at timestamptz not null default now(),
  check_in_latitude numeric not null,
  check_in_longitude numeric not null,
  check_in_distance_meters numeric,

  -- Check-out is the open half of the record, filled in later.
  check_out_at timestamptz,
  check_out_latitude numeric,
  check_out_longitude numeric,
  check_out_distance_meters numeric,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── row-level security ─────────────────────────────────────────────────────
-- ALL POLICIES INFERRED.

alter table public.attendance_records enable row level security;

create policy "attendance: read own"
  on public.attendance_records for select to authenticated
  using (user_id = (select auth.uid()));

-- Admins read their own hospitals' attendance — AttendanceReports.tsx is the
-- consumer, and it is reachable only by admin and master.
create policy "attendance: admins read at their hospitals"
  on public.attendance_records for select to authenticated
  using (
    public.is_admin_or_higher((select auth.uid()))
    and public.admin_has_hospital((select auth.uid()), hospital)
  );

-- You may only check yourself in, only at a hospital you are assigned to, and
-- only while enabled.
create policy "attendance: check in as self"
  on public.attendance_records for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.user_is_enabled((select auth.uid()))
    and public.user_has_hospital_access(hospital, (select auth.uid()))
  );

-- Check-out is an update to your own open record.
create policy "attendance: check out own"
  on public.attendance_records for update to authenticated
  using (user_id = (select auth.uid()) and public.user_is_enabled((select auth.uid())))
  with check (user_id = (select auth.uid()));

-- Deliberately no delete policy: an attendance record is evidence of a shift,
-- and nothing in the app deletes one.

create index attendance_user_check_in_idx
  on public.attendance_records (user_id, check_in_at desc);
create index attendance_hospital_check_in_idx
  on public.attendance_records (hospital, check_in_at desc);
-- INFERRED: at most one open (not yet checked out) record per account.
create unique index attendance_one_open_per_user
  on public.attendance_records (user_id)
  where check_out_at is null;
