-- Staff invitations expire, and record when they were last emailed.
--
-- An invitation used to stay open for ever: one forgotten in the list could be
-- taken up by whoever held that address months later. It now lapses after 30
-- days unless a master extends it (the edit dialog does, on save), and
-- handle_new_user() ignores a lapsed one -- that signup lands as an ordinary
-- uninvited account in the approval queue instead.
--
-- last_emailed_at / email_count back the invitation email
-- (send-staff-invitation): the list shows when it was last sent, and the
-- function refuses to resend within two minutes.
--
-- Safe to run twice.

alter table public.staff_invitations
  add column if not exists expires_at      timestamptz,
  add column if not exists last_emailed_at timestamptz,
  add column if not exists email_count     integer not null default 0;

-- Existing rows: 30 days from when they were made, as a new one would get.
update public.staff_invitations
set expires_at = created_at + interval '30 days'
where expires_at is null;

alter table public.staff_invitations
  alter column expires_at set default (now() + interval '30 days'),
  alter column expires_at set not null;

-- Unchanged from the live definition except for the expiry condition on the
-- lookup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
    -- an account created without an email address. A lapsed invitation is
    -- ignored: that signup becomes an ordinary one, awaiting approval.
    select * into _invite
    from public.staff_invitations
    where email = lower(new.email)
      and accepted_at is null
      and revoked_at is null
      and expires_at > now();

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

      -- Note what is NOT here: no insert into user_permissions. See
      -- 20260908075618_staff_invitations.sql: activation stays a human step.
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
$function$;
