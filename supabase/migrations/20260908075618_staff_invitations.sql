-- Master-admin onboarding: invite a staff member before their first sign-in.
--
-- ## The gap this closes
--
-- Until now the only way into CPMS was: the person signs in with Google, lands
-- on a dashboard that shows them nothing, and waits for somebody to notice them
-- in the "Awaiting approval" list on /cpms/admin/users. Nobody chose their role
-- or their hospital in advance, and nothing told the new account it was waiting
-- on anyone.
--
-- An invitation records that decision up front. The master administrator says
-- "this email address, this role, these hospitals"; when that person first
-- signs in, handle_new_user() applies it.
--
-- ## What an invitation deliberately does NOT do
--
-- It does not enable the account. No `user_permissions` row is created here,
-- and that omission is load-bearing in three places that already agree with
-- each other:
--
--   * user_is_enabled() and user_can_scan() are COALESCE(..., false), so a
--     missing row denies every clinical policy in 120200/120300.
--   * useRole.tsx reads a missing row as all-false, deliberately.
--   * UserManagement.tsx lists exactly the accounts with no permissions row as
--     "Awaiting approval".
--
-- So an invited account signs in, receives its role and hospitals, and lands on
-- the Pending Activation screen until an administrator turns it on. An emailed
-- invitation is a claim about who someone is; activation is a human confirming
-- it. Keeping those separate means a mistyped address cannot provision itself,
-- and it keeps the existing approval queue as the single place where access is
-- actually granted.

-- ─── table ──────────────────────────────────────────────────────────────────

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),

  -- Stored already lower-cased, and the constraint holds callers to it. The
  -- lookup in handle_new_user() compares against lower(new.email), so a row
  -- written as "Name@Example.com" would simply never match and the invitation
  -- would sit open forever with nothing to explain why.
  email text not null,

  -- The app_role written straight into user_roles on acceptance. Note the UI
  -- calls 'staff' "User (Standard Staff)" and maps it at the boundary, exactly
  -- as UserManagement.tsx's saveUserChanges() already does; the enum's fourth
  -- value 'user' is what handle_new_user() gives an *uninvited* signup, and is
  -- not offered here. Nor is 'master' — see the constraint below.
  role public.app_role not null default 'staff',

  -- Hospital *names*, not ids — `hospital` is text throughout this schema and
  -- 20260830120100_hospitals.sql explains why it was left that way. An array
  -- rather than one row per hospital so that revoking an invitation, and
  -- reading back what was offered, are single-row operations.
  hospitals text[] not null,

  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- Set by handle_new_user() when the invited address first signs in. The row
  -- is kept afterwards rather than deleted: it is the record of who granted
  -- this account its role and hospitals, which nothing else in the schema
  -- stores. hospital_assignments.assigned_by comes closest but says nothing
  -- about the role.
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,

  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,

  constraint staff_invitations_email_lowercase check (email = lower(email)),
  -- Deliberately loose: enough to reject a name, a blank, or a pasted display
  -- string, and not enough to argue with a real address. The address is checked
  -- for real by the fact that Google has to authenticate it.
  constraint staff_invitations_email_shape
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- coalesce, not a bare array_length: on an empty array array_length() is
  -- NULL, `NULL >= 1` is NULL, and a CHECK passes on anything that is not
  -- false — so without it `hospitals => '{}'` sailed through and produced an
  -- invitation that granted access to nothing. array_position() rather than a
  -- subquery over unnest() because a CHECK constraint may contain neither a
  -- subquery nor a set-returning function.
  constraint staff_invitations_hospitals_present
    check (
      coalesce(array_length(hospitals, 1), 0) >= 1
      and array_position(hospitals, null) is null
      and array_position(hospitals, '') is null
    ),
  -- 'user' is the uninvited default and is not an invitable role; see `role`.
  --
  -- 'master' is excluded for a sharper reason: it would create an account that
  -- can never be switched on. 20260908074018_peer_role_management.sql gates
  -- every write to user_permissions on can_manage_user(), which requires the
  -- writer to outrank the target — and nothing outranks 'master'. An account
  -- that arrives already holding it therefore has no permissions row and nobody
  -- who can ever create one.
  --
  -- Note where that actually strands them, because it is not the pending
  -- screen: landingRouteFor() exempts administrators from the activation gate
  -- (an admin's permissions row has always been optional, and admins are who
  -- lift a pending state), so the account reaches the dashboard and looks
  -- fine. It is the clinical policies in 120200/120300 that refuse it — every
  -- one gates on user_is_enabled() — so it could open the app but never read a
  -- patient record, save one, or check in, with no way for anyone to fix it.
  --
  -- That migration's own header gives the working order: enable and assign the
  -- account while it is still a user or admin, and promote it last. So invite a
  -- new master as 'admin', activate them, then raise the role from the edit
  -- dialog.
  --
  -- TREAT THIS CONSTRAINT AS LOAD-BEARING, not as a convenience. Since
  -- 20260908075627_assign_below_own_role.sql, writes to user_roles must satisfy
  -- role_rank(role) < role_rank(get_user_role(auth.uid())) — but the acceptance
  -- trigger below is SECURITY DEFINER and runs with no actor at all, so it
  -- bypasses that check completely. This CHECK is therefore the only thing
  -- standing between an invitation and a 'master' grant that no rank rule ever
  -- examined. Widening it re-opens that path.
  constraint staff_invitations_role_allowed check (role in ('staff', 'admin'))
);

-- One live invitation per address. Accepted and revoked rows fall out of the
-- index, so the same person can be re-invited after either. This is also the
-- index handle_new_user() searches on every signup.
create unique index staff_invitations_open_email_key
  on public.staff_invitations (email)
  where accepted_at is null and revoked_at is null;

-- ─── acceptance, on first sign-in ───────────────────────────────────────────
--
-- A superset of the previous handle_new_user() (20260830120000): same profile
-- insert, same fallback role, with the invitation lookup added in between.
--
-- The whole invitation branch sits inside its own BEGIN/EXCEPTION block. This
-- function runs inside the transaction that creates the auth.users row, so an
-- error raised here does not merely skip the invitation — it fails the signup
-- and the person cannot get an account at all. plpgsql's exception handler
-- wraps the block in a savepoint, so a half-applied invitation is rolled back
-- and the account is still created with the ordinary 'user' role, which the
-- approval queue then picks up as it always did.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _invite public.staff_invitations%rowtype;
  _hospital text;
  _applied boolean := false;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  begin
    -- lower(null) is null and matches nothing, which is the right answer for
    -- an account created without an email address.
    select * into _invite
    from public.staff_invitations
    where email = lower(new.email)
      and accepted_at is null
      and revoked_at is null;

    if found then
      insert into public.user_roles (user_id, role)
      values (new.id, _invite.role)
      on conflict (user_id, role) do nothing;

      foreach _hospital in array _invite.hospitals loop
        insert into public.hospital_assignments (user_id, hospital, assigned_by)
        values (new.id, _hospital, _invite.invited_by)
        on conflict (user_id, hospital) do nothing;
      end loop;

      update public.staff_invitations
      set accepted_at = now(), accepted_by = new.id
      where id = _invite.id;

      -- Note what is NOT here: no insert into user_permissions. See the header.
      _applied := true;
    end if;
  exception when others then
    _applied := false;
  end;

  if not _applied then
    insert into public.user_roles (user_id, role)
    values (new.id, 'user')
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

-- ─── row-level security ─────────────────────────────────────────────────────
--
-- Only a master writes invitations. An admin who could create one could invite
-- themselves a second account as 'master' and escalate, which is the same
-- reasoning that already makes user_roles master-only in 20260830120000 — an
-- accepted invitation is a user_roles insert with a delay on it.
--
-- Admins do get to *read* invitations covering a hospital they run, so a
-- hospital admin can see that the person they are expecting has been invited
-- and has not signed in yet.

alter table public.staff_invitations enable row level security;

create policy "staff_invitations: masters read"
  on public.staff_invitations for select to authenticated
  using (public.is_master((select auth.uid())));

create policy "staff_invitations: admins read own hospitals"
  on public.staff_invitations for select to authenticated
  using (
    public.is_admin_or_higher((select auth.uid()))
    and exists (
      select 1 from unnest(hospitals) as h
      where public.admin_has_hospital((select auth.uid()), h)
    )
  );

-- invited_by is pinned to the caller on insert so the audit trail cannot be
-- written to name someone else. It is not pinned on update, because revoking
-- an invitation somebody else sent is a normal thing for a master to do.
create policy "staff_invitations: masters create"
  on public.staff_invitations for insert to authenticated
  with check (
    public.is_master((select auth.uid()))
    and invited_by = (select auth.uid())
    -- Redundant while the line above holds — a master outranks both invitable
    -- roles — and deliberately kept anyway. The invariant that matters is "you
    -- cannot invite a peer you would then be unable to manage", and stating it
    -- on the row means loosening this policy to let admins invite does not
    -- silently let an admin mint an 'admin' peer.
    and (role = 'staff' or public.is_master((select auth.uid())))
  );

create policy "staff_invitations: masters update"
  on public.staff_invitations for update to authenticated
  using (public.is_master((select auth.uid())))
  with check (public.is_master((select auth.uid())));

create policy "staff_invitations: masters delete"
  on public.staff_invitations for delete to authenticated
  using (public.is_master((select auth.uid())));

-- ─── grants ─────────────────────────────────────────────────────────────────
-- Supabase's default privileges grant every new table in `public` to anon,
-- authenticated and service_role. RLS means anon would see nothing, but the
-- reasoning in 20260830120700_function_grants.sql applies here too: an
-- anonymous caller has no business holding a grant on a table of staff email
-- addresses, so take it away rather than rely on the policies alone.
revoke all on public.staff_invitations from anon;
