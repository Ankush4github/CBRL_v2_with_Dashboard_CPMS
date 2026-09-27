-- Access fixes from the 2026-09-26 review of User Management and the patient
-- pages. Every finding below was confirmed against the live definitions.
--
-- 1. Admins could manage staff at hospitals they don't run. The
--    user_permissions and profiles write policies compared rank only, so an
--    admin at hospital A could disable, enable or grant scan to anyone at B.
-- 2. Saving a user wiped assignments. The page deleted and re-inserted every
--    hospital row it could *see*, but RLS let it delete only its own: for a
--    nurse at A and Z it removed A, then failed re-inserting Z, and the nurse
--    lost A. admin_update_user() replaces those five client writes with one
--    transaction that touches only hospitals the caller runs.
-- 3. create_patient_record() stored any storage path it was sent, and storage
--    reads trust any record at your hospital -- so pointing a record at another
--    hospital's file made that file readable. It now requires each file to be
--    the caller's own upload and not already used by another record.
-- 4. Any admin could delete any prescriptions file, at any hospital, including
--    referenced ones; any admin (not just masters, as the UI implies) could
--    delete records; and neither checked the account was still enabled.
-- 5. Deleting a record cascaded its audit rows away and left no trace of who
--    deleted what. patient_record_deletions keeps a minimal tombstone.

-- ─── 1. hospital scope for managing staff ───────────────────────────────────
-- An admin may manage a lower-ranked account that shares one of their
-- hospitals, or one with no hospital yet (a new signup waiting for set-up).
-- Masters manage everyone below them.
create or replace function public.admin_may_manage_staff(_admin_id uuid, _target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_user(_admin_id, _target_user_id)
     and (
       public.is_master(_admin_id)
       or not exists (
         select 1 from public.hospital_assignments where user_id = _target_user_id
       )
       or public.admin_shares_hospital_with_user(_admin_id, _target_user_id)
     );
$$;

revoke execute on function public.admin_may_manage_staff(uuid, uuid) from public, anon;
grant  execute on function public.admin_may_manage_staff(uuid, uuid) to authenticated;

drop policy if exists "user_permissions: admins manage lower ranks" on public.user_permissions;
create policy "user_permissions: admins manage lower ranks" on public.user_permissions
  for all to authenticated
  using (
    public.is_admin_or_higher((select auth.uid()))
    and public.user_is_enabled((select auth.uid()))
    and public.admin_may_manage_staff((select auth.uid()), user_id)
  )
  with check (
    public.is_admin_or_higher((select auth.uid()))
    and public.user_is_enabled((select auth.uid()))
    and public.admin_may_manage_staff((select auth.uid()), user_id)
  );

drop policy if exists "profiles: admins update lower ranks" on public.profiles;
create policy "profiles: admins update lower ranks" on public.profiles
  for update to authenticated
  using (
    public.is_admin_or_higher((select auth.uid()))
    and public.user_is_enabled((select auth.uid()))
    and public.admin_may_manage_staff((select auth.uid()), id)
  )
  with check (
    public.is_admin_or_higher((select auth.uid()))
    and public.user_is_enabled((select auth.uid()))
    and public.admin_may_manage_staff((select auth.uid()), id)
  );

-- The accounts User Management should list for the caller. Reads of profiles
-- stay open to admins (attendance reports and the audit log use them); this is
-- what decides who appears as manageable, since the client cannot see another
-- hospital's assignments to tell "no hospital" from "not my hospital".
create or replace function public.admin_manageable_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where public.is_admin_or_higher(auth.uid())
    and public.admin_may_manage_staff(auth.uid(), p.id);
$$;

revoke execute on function public.admin_manageable_user_ids() from public, anon;
grant  execute on function public.admin_manageable_user_ids() to authenticated;

-- ─── 2. one transactional save for a user ───────────────────────────────────
-- _hospitals is the full list the dialog shows. Hospitals the caller runs are
-- set to match it; hospitals the caller does not run are left exactly as they
-- are (listed or not), and cannot be added.
create or replace function public.admin_update_user(
  _target_user_id uuid,
  _hospitals text[],
  _can_scan boolean,
  _can_upload boolean,
  _is_enabled boolean,
  _role text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _actor uuid := auth.uid();
  _desired text[] := coalesce(_hospitals, '{}');
  _current_role text;
  _new_role text;
begin
  if _actor is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not (public.is_admin_or_higher(_actor) and public.user_is_enabled(_actor)) then
    raise exception 'Only administrators can change user settings' using errcode = '42501';
  end if;

  if not public.can_manage_user(_actor, _target_user_id) then
    raise exception 'You can only change accounts ranked below your own' using errcode = '42501';
  end if;

  if not public.admin_may_manage_staff(_actor, _target_user_id) then
    raise exception 'This person works only at hospitals you do not manage' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(_desired) h
    where not exists (select 1 from public.hospitals where name = h)
  ) then
    raise exception 'One of the selected hospitals no longer exists' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(_desired) h
    where not public.admin_has_hospital(_actor, h)
      and not exists (
        select 1 from public.hospital_assignments
        where user_id = _target_user_id and hospital = h
      )
  ) then
    raise exception 'You can only assign hospitals you manage' using errcode = '42501';
  end if;

  delete from public.hospital_assignments
  where user_id = _target_user_id
    and public.admin_has_hospital(_actor, hospital)
    and hospital <> all (_desired);

  insert into public.hospital_assignments (user_id, hospital, assigned_by)
  select _target_user_id, h, _actor
  from unnest(_desired) h
  where public.admin_has_hospital(_actor, h)
  on conflict (user_id, hospital) do nothing;

  -- An enabled account with no hospital signs in and sees nothing -- the exact
  -- state the approval queue exists to catch -- so enabling needs one.
  if coalesce(_is_enabled, false)
     and public.role_rank(public.get_user_role(_target_user_id)) < public.role_rank('master')
     and not exists (select 1 from public.hospital_assignments where user_id = _target_user_id)
  then
    raise exception 'Assign at least one hospital before enabling this account' using errcode = '22023';
  end if;

  insert into public.user_permissions (user_id, can_scan, can_upload, is_enabled, updated_by, updated_at)
  values (_target_user_id, coalesce(_can_scan, false), coalesce(_can_upload, false),
          coalesce(_is_enabled, false), _actor, now())
  on conflict (user_id) do update
    set can_scan   = excluded.can_scan,
        can_upload = excluded.can_upload,
        is_enabled = excluded.is_enabled,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  -- Role last, and only a real change. 'user' and 'staff' are the same rank;
  -- the screen calls it "user" and stores 'staff'.
  if _role is not null then
    _new_role := case when _role = 'user' then 'staff' else _role end;
    _current_role := public.get_user_role(_target_user_id);

    if public.role_rank(_new_role) <> public.role_rank(_current_role) then
      if _new_role not in ('staff', 'admin') then
        raise exception 'That role cannot be assigned here' using errcode = '42501';
      end if;
      if not public.is_master(_actor) then
        raise exception 'Only a master can change roles' using errcode = '42501';
      end if;
      if public.role_rank(_new_role) >= public.role_rank(public.get_user_role(_actor)) then
        raise exception 'You can only assign a role below your own' using errcode = '42501';
      end if;

      delete from public.user_roles where user_id = _target_user_id;
      insert into public.user_roles (user_id, role) values (_target_user_id, _new_role::public.app_role);
    end if;
  end if;
end;
$$;

revoke execute on function public.admin_update_user(uuid, text[], boolean, boolean, boolean, text) from public, anon;
grant  execute on function public.admin_update_user(uuid, text[], boolean, boolean, boolean, text) to authenticated;

-- ─── 3. records may only point at the caller's own, unused uploads ──────────
-- Unchanged from the live definition except for the file check after the
-- idempotency return: a retry of an already-saved draft still returns it.
create or replace function public.create_patient_record(
  _draft_id uuid,
  _patient_id text,
  _patient_name text,
  _hospital text,
  _uhid text default null,
  _age integer default null,
  _gender text default null,
  _height_cm numeric default null,
  _weight_kg numeric default null,
  _bmi numeric default null,
  _visit_date date default null,
  _doctor_name text default null,
  _diagnosis text default null,
  _medicines jsonb default '[]'::jsonb,
  _additional_documents jsonb default '[]'::jsonb,
  _prescription_image_url text default null,
  _confidence_score numeric default null,
  _extraction_raw jsonb default null
)
returns table (created_id uuid, created_reference_number text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  _actor uuid := auth.uid();
  _existing_id uuid;
  _existing_ref text;
  _ref text;
  _new_id uuid;
  _effective_visit_date date;
begin
  if _actor is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not public.user_can_scan(_actor) then
    raise exception 'You do not have permission to save prescriptions'
      using errcode = '42501';
  end if;

  if not public.user_has_hospital_access(_hospital, _actor) then
    raise exception 'You are not assigned to this hospital'
      using errcode = '42501';
  end if;

  if _draft_id is null then
    raise exception 'A draft id is required' using errcode = '22004';
  end if;

  if nullif(btrim(coalesce(_patient_name, '')), '') is null then
    raise exception 'A patient name is required' using errcode = '22004';
  end if;

  -- Idempotency. Returns the record this draft already produced rather than
  -- making a second one, so a retry is always safe.
  select id, reference_number into _existing_id, _existing_ref
  from public.patient_records
  where draft_id = _draft_id;

  if _existing_id is not null then
    return query select _existing_id, _existing_ref;
    return;
  end if;

  -- Every file this record will point at must be one the caller uploaded and
  -- that no other record uses. Storage reads trust any record at the reader's
  -- hospital, so an unchecked path here would hand out another hospital's file.
  if exists (
    select 1
    from (
      select _prescription_image_url as path
      where _prescription_image_url is not null
      union all
      select d->>'url'
      from jsonb_array_elements(
        case when jsonb_typeof(_additional_documents) = 'array'
             then _additional_documents else '[]'::jsonb end
      ) d
    ) f
    where f.path is null
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'prescriptions'
           and o.name = f.path
           and o.owner_id = _actor::text
       )
       or public.prescription_object_is_referenced(f.path)
  ) then
    raise exception 'An attached file could not be verified. Please start the scan again.'
      using errcode = '42501';
  end if;

  -- Resolved once, so the row and its provenance cannot disagree.
  _effective_visit_date := coalesce(_visit_date, current_date);

  _ref := public.generate_reference_number(_hospital);

  insert into public.patient_records (
    draft_id, patient_id, patient_name, hospital, uhid, age, gender,
    height_cm, weight_kg, bmi, visit_date, doctor_name, diagnosis,
    medicines, additional_documents, prescription_image_url,
    confidence_score, extraction_raw, reference_number, uploaded_by
  ) values (
    _draft_id, btrim(coalesce(_patient_id, '')), btrim(_patient_name), _hospital,
    _uhid, _age, _gender, _height_cm, _weight_kg, _bmi,
    _effective_visit_date,
    _doctor_name, _diagnosis,
    coalesce(_medicines, '[]'::jsonb), coalesce(_additional_documents, '[]'::jsonb),
    _prescription_image_url, _confidence_score, _extraction_raw, _ref, _actor
  )
  returning id into _new_id;

  -- Provenance: one row per field the operator corrected, holding what the
  -- model read and what was actually saved.
  if _extraction_raw is not null then
    insert into public.patient_record_audit
      (patient_record_id, field_name, old_value, new_value, changed_by)
    select _new_id, 'ai:' || f.field, f.read_value, f.saved_value, _actor
    from (values
      ('patient_name', _extraction_raw->>'patient_name', btrim(_patient_name)),
      ('age',          _extraction_raw->>'age',          _age::text),
      ('gender',       _extraction_raw->>'gender',       _gender),
      ('height_cm',    _extraction_raw->>'height_cm',    _height_cm::text),
      ('weight_kg',    _extraction_raw->>'weight_kg',    _weight_kg::text),
      ('doctor_name',  _extraction_raw->>'doctor_name',  _doctor_name),
      ('diagnosis',    _extraction_raw->>'diagnosis',    _diagnosis),
      ('visit_date',   _extraction_raw->>'visit_date',   _effective_visit_date::text),
      ('uhid',         _extraction_raw->>'uhid',         _uhid)
    ) as f(field, read_value, saved_value)
    where public.norm_audit_value(f.read_value)
            is distinct from public.norm_audit_value(f.saved_value);

    -- Medicines, compared structurally rather than as two strings. The row this
    -- writes still carries the real JSON on both sides -- only the decision to
    -- write it has changed.
    if public.norm_audit_medicines(_extraction_raw->'medicines')
         is distinct from public.norm_audit_medicines(coalesce(_medicines, '[]'::jsonb))
    then
      insert into public.patient_record_audit
        (patient_record_id, field_name, old_value, new_value, changed_by)
      values (
        _new_id,
        'ai:medicines',
        coalesce(_extraction_raw->'medicines', '[]'::jsonb) #>> '{}',
        coalesce(_medicines, '[]'::jsonb) #>> '{}',
        _actor
      );
    end if;
  end if;

  return query select _new_id, _ref;
end;
$fn$;

-- ─── 4. who may delete ──────────────────────────────────────────────────────
-- Records: masters only, as the UI already implies, and only while enabled.
drop policy if exists "patient_records: admins delete" on public.patient_records;
drop policy if exists "patient_records: masters delete" on public.patient_records;
create policy "patient_records: masters delete" on public.patient_records
  for delete to authenticated
  using (
    public.is_master((select auth.uid()))
    and public.user_is_enabled((select auth.uid()))
  );

-- Files: an enabled admin may delete only a file they can already read, i.e.
-- one attached to a record at their hospitals. Uploaders keep their own
-- unreferenced-file policy; the nightly sweeper uses the service role.
drop policy if exists "prescriptions: admins delete" on storage.objects;
create policy "prescriptions: admins delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'prescriptions'
    and public.is_admin_or_higher((select auth.uid()))
    and public.user_is_enabled((select auth.uid()))
    and public.prescription_object_is_readable(name, (select auth.uid()))
  );

-- ─── 5. a trace of every deleted record ─────────────────────────────────────
-- Deliberately minimal: enough to answer who deleted which record, from which
-- hospital, and when -- not a copy of the clinical content that was deleted.
create table if not exists public.patient_record_deletions (
  id                uuid primary key default gen_random_uuid(),
  patient_record_id uuid not null,
  reference_number  text,
  patient_id        text,
  hospital          text,
  record_created_at timestamptz,
  deleted_by        uuid,
  deleted_at        timestamptz not null default now()
);

alter table public.patient_record_deletions enable row level security;

drop policy if exists "patient_record_deletions: admins read at their hospitals" on public.patient_record_deletions;
create policy "patient_record_deletions: admins read at their hospitals" on public.patient_record_deletions
  for select to authenticated
  using (
    public.is_admin_or_higher((select auth.uid()))
    and public.user_is_enabled((select auth.uid()))
    and public.admin_has_hospital((select auth.uid()), hospital)
  );

create or replace function public.log_patient_record_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.patient_record_deletions
    (patient_record_id, reference_number, patient_id, hospital, record_created_at, deleted_by)
  values
    (old.id, old.reference_number, old.patient_id, old.hospital, old.created_at, auth.uid());
  return old;
end;
$$;

revoke all on function public.log_patient_record_deletion() from public, anon, authenticated;

drop trigger if exists patient_records_log_deletion on public.patient_records;
create trigger patient_records_log_deletion
  before delete on public.patient_records
  for each row execute function public.log_patient_record_deletion();

-- ─── 6. names on a record's change history ──────────────────────────────────
-- profiles is readable only by admins and by each user for themselves, so a
-- standard user saw "Unknown User" for every colleague in a record's history.
-- This returns only display names, only for people who changed that record,
-- and only when the caller can read the record itself.
create or replace function public.audit_changer_names(_record_id uuid)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.id, coalesce(nullif(btrim(p.full_name), ''), p.email)
  from public.patient_record_audit a
  join public.patient_records r on r.id = a.patient_record_id
  join public.profiles p on p.id = a.changed_by
  where a.patient_record_id = _record_id
    and public.user_is_enabled(auth.uid())
    and public.user_has_hospital_access(r.hospital, auth.uid());
$$;

revoke execute on function public.audit_changer_names(uuid) from public, anon;
grant  execute on function public.audit_changer_names(uuid) to authenticated;
