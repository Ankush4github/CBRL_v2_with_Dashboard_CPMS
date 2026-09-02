-- Core identity: roles, profiles and per-account permissions.
--
-- RECONSTRUCTED, NOT RECOVERED. The project this schema came from
-- (CPMS_Local, ref ryynfsvuucgiokrmqyvz) was deleted, and this repository has
-- never held migration files. Table and column definitions below are taken
-- from shared/supabase-types.ts, which is a generated — and therefore exact —
-- description of that project's tables, columns, types, nullability and
-- defaults.
--
-- What the generated types do NOT record, and what is therefore inferred from
-- the application code and its comments: RLS policies, function bodies,
-- triggers, indexes and constraints. Every such block is marked INFERRED.
-- Review those before trusting them with patient data.

create extension if not exists pgcrypto with schema extensions;

-- ─── enums ──────────────────────────────────────────────────────────────────
-- Exact, from Constants.public.Enums in shared/supabase-types.ts.

create type public.app_role as enum ('admin', 'staff', 'master', 'user');

create type public.notification_type as enum (
  'shift_start',
  'checkin_reminder',
  'checkin_final_reminder',
  'shift_end',
  'checkout_reminder',
  'checkout_final_reminder'
);

-- ─── tables ─────────────────────────────────────────────────────────────────

create table public.profiles (
  -- Insert requires `id` with no default, so it is supplied by the caller —
  -- handle_new_user() below passes auth.users.id.
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  clinic_name text,
  staff_role text,
  onboarding_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null default 'user',
  -- INFERRED. has_role() tests membership rather than reading a single row, so
  -- an account may hold several roles; this stops it holding the same one twice.
  unique (user_id, role)
);

create table public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  -- INFERRED unique: useRole.tsx reads this with .eq(user_id).maybeSingle(),
  -- which errors if more than one row matches.
  user_id uuid not null unique references auth.users (id) on delete cascade,
  -- Nullable with a false default. useRole.tsx documents that a missing row
  -- must deny, and user_is_enabled()/user_can_scan() COALESCE to false to match.
  can_scan boolean default false,
  can_upload boolean default false,
  is_enabled boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- ─── role helpers ───────────────────────────────────────────────────────────
-- Signatures (name, argument names, argument order, return type) are exact,
-- from Database["public"]["Functions"]. The BODIES ARE INFERRED.
--
-- All are SECURITY DEFINER with an empty search_path. Definer rights are what
-- lets a policy on user_roles call has_role() without the function's own read
-- of user_roles re-entering that policy and recursing; the empty search_path
-- is why every reference below is schema-qualified.

create or replace function public.has_role(_role public.app_role, _user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_master(_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role('master', _user_id);
$$;

create or replace function public.is_admin_or_higher(_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role('admin', _user_id) or public.has_role('master', _user_id);
$$;

-- Returns text, not app_role — useRole.tsx casts the result. Highest-privilege
-- role wins, and an account with no row reads as 'user', matching the hook's
-- `(roleData as UserRole) || "user"` fallback.
create or replace function public.get_user_role(_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (
      select role::text from public.user_roles
      where user_id = _user_id
      order by case role
        when 'master' then 1
        when 'admin'  then 2
        when 'staff'  then 3
        else 4
      end
      limit 1
    ),
    'user'
  );
$$;

-- COALESCE(..., false) is load-bearing and documented in two places:
-- src/lib/supabase/config.ts ("every clinical policy is gated on
-- user_is_enabled(), which is COALESCE(..., false)") and cpms-next/hooks/
-- useRole.tsx ("handle_new_user() creates profiles + user_roles but NOT
-- user_permissions, so every new signup lands here"). A brand-new account, and
-- a website editor who has no CPMS permissions row at all, must both read false.
create or replace function public.user_is_enabled(_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select is_enabled from public.user_permissions where user_id = _user_id),
    false
  );
$$;

create or replace function public.user_can_scan(_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (
      select coalesce(can_scan, false) and coalesce(is_enabled, false)
      from public.user_permissions where user_id = _user_id
    ),
    false
  );
$$;

-- ─── new-account trigger ────────────────────────────────────────────────────
-- INFERRED, but its shape is pinned by the comment in useRole.tsx: it creates
-- profiles and user_roles and deliberately does NOT create user_permissions,
-- so a new signup is denied everything until an admin grants it.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── row-level security ─────────────────────────────────────────────────────
-- ALL POLICIES BELOW ARE INFERRED from how the app reads and writes these
-- tables. They are the least-privilege reading consistent with the code; the
-- originals may have been broader. Review before relying on them.

alter table public.profiles         enable row level security;
alter table public.user_roles       enable row level security;
alter table public.user_permissions enable row level security;

-- profiles: an account sees and edits its own; admins see all, because
-- UserManagement.tsx lists every user with their profile details.
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: admins read all"
  on public.profiles for select to authenticated
  using (public.is_admin_or_higher((select auth.uid())));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles: admins update all"
  on public.profiles for update to authenticated
  using (public.is_admin_or_higher((select auth.uid())))
  with check (public.is_admin_or_higher((select auth.uid())));

-- user_roles: readable by the account it describes and by admins. Only a
-- master may change roles — an admin who could grant 'master' could escalate.
create policy "user_roles: read own"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_roles: admins read all"
  on public.user_roles for select to authenticated
  using (public.is_admin_or_higher((select auth.uid())));

create policy "user_roles: masters manage"
  on public.user_roles for all to authenticated
  using (public.is_master((select auth.uid())))
  with check (public.is_master((select auth.uid())));

-- user_permissions: an account reads its own (useRole.tsx does exactly this on
-- every load); admins and masters grant and revoke.
create policy "user_permissions: read own"
  on public.user_permissions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_permissions: admins read all"
  on public.user_permissions for select to authenticated
  using (public.is_admin_or_higher((select auth.uid())));

create policy "user_permissions: admins manage"
  on public.user_permissions for all to authenticated
  using (public.is_admin_or_higher((select auth.uid())))
  with check (public.is_admin_or_higher((select auth.uid())));

-- ─── indexes ────────────────────────────────────────────────────────────────
-- INFERRED, from the lookups the app performs on every page load.
create index if not exists user_roles_user_id_idx on public.user_roles (user_id);
