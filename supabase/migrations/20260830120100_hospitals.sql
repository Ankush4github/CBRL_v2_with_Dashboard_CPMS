-- Hospitals and per-account hospital access.
--
-- RECONSTRUCTED — see the header of 20260830120000_core_identity.sql.
--
-- Note `hospital` is TEXT throughout, holding the hospital's name rather than a
-- foreign key to hospitals.id. That is not a simplification on my part: every
-- one of these tables reports `Relationships: []` in the generated types, so no
-- foreign key existed, and useRole.tsx compares assigned hospitals to a plain
-- string with `assignedHospitals.includes(hospital)`. Adding a foreign key here
-- would be an improvement, but it would also change behaviour, so it is left
-- as it was and flagged instead.

create table public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude numeric,
  longitude numeric,
  -- Non-null with defaults: Insert marks all three optional, Row marks them
  -- non-null. Values are inferred; the columns are not.
  radius_meters integer not null default 200,
  work_days integer[] not null default '{1,2,3,4,5}',
  work_start_time time not null default '09:00:00',
  work_end_time time not null default '17:00:00',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- INFERRED: hospital names are compared as identity across four tables, so
-- duplicates would silently split a hospital's records in two.
create unique index hospitals_name_key on public.hospitals (lower(name));

create table public.hospital_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hospital text not null,
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz default now(),
  -- INFERRED. UserManagement.tsx re-inserts a user's assignments after
  -- deleting them; without this a double submit duplicates every row.
  unique (user_id, hospital)
);

-- ─── access helpers ─────────────────────────────────────────────────────────
-- Signatures exact; BODIES INFERRED.

-- A master reaches every hospital — useRole.tsx's canAccessHospital() returns
-- true for master before consulting the assignment list at all.
create or replace function public.user_has_hospital_access(_hospital text, _user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_master(_user_id)
      or exists (
        select 1 from public.hospital_assignments
        where user_id = _user_id and hospital = _hospital
      );
$$;

create or replace function public.admin_has_hospital(_admin_id uuid, _hospital text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_master(_admin_id)
      or exists (
        select 1 from public.hospital_assignments
        where user_id = _admin_id and hospital = _hospital
      );
$$;

-- True when the admin and the target account share at least one hospital. This
-- is what stops an admin at one hospital from managing staff at another.
create or replace function public.admin_shares_hospital_with_user(_admin_id uuid, _target_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_master(_admin_id)
      or exists (
        select 1
        from public.hospital_assignments a
        join public.hospital_assignments t on t.hospital = a.hospital
        where a.user_id = _admin_id and t.user_id = _target_user_id
      );
$$;

-- ─── row-level security ─────────────────────────────────────────────────────
-- ALL POLICIES INFERRED.

alter table public.hospitals            enable row level security;
alter table public.hospital_assignments enable row level security;

-- Every signed-in account can read the hospital list: useHospitals.tsx loads it
-- unconditionally to render pickers, and the row carries no patient data.
create policy "hospitals: read"
  on public.hospitals for select to authenticated
  using (public.user_is_enabled((select auth.uid())) or public.is_admin_or_higher((select auth.uid())));

create policy "hospitals: admins manage"
  on public.hospitals for all to authenticated
  using (public.is_admin_or_higher((select auth.uid())))
  with check (public.is_admin_or_higher((select auth.uid())));

create policy "hospital_assignments: read own"
  on public.hospital_assignments for select to authenticated
  using (user_id = (select auth.uid()));

create policy "hospital_assignments: admins read shared"
  on public.hospital_assignments for select to authenticated
  using (public.admin_shares_hospital_with_user((select auth.uid()), user_id));

create policy "hospital_assignments: admins manage shared"
  on public.hospital_assignments for all to authenticated
  using (
    public.is_admin_or_higher((select auth.uid()))
    and public.admin_has_hospital((select auth.uid()), hospital)
  )
  with check (
    public.is_admin_or_higher((select auth.uid()))
    and public.admin_has_hospital((select auth.uid()), hospital)
  );

create index hospital_assignments_user_id_idx on public.hospital_assignments (user_id);
create index hospital_assignments_hospital_idx on public.hospital_assignments (hospital);
