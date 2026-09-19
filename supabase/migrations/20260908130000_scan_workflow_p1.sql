-- Scan Prescription workflow, P1: atomic commit, idempotency, and provenance
-- for AI-extracted clinical data.
--
-- Three problems, all downstream of the same thing: the record was assembled by
-- the browser across several unrelated round trips, and nothing recorded that a
-- model had written most of it.

-- ─── 1. columns the commit needs ────────────────────────────────────────────
-- draft_id makes the save idempotent. Every scan mints one client-side and
-- sends it with the commit, so a double-tap, an impatient second press, or a
-- retry after a timeout that had actually succeeded all resolve to the same
-- record instead of a duplicate. It is what lets the five-attempt retry loop
-- come out of ScanPrescription.tsx.
alter table public.patient_records
  add column if not exists draft_id uuid;

-- Partial, because every row predating this has no draft to key on.
create unique index if not exists patient_records_draft_id_key
  on public.patient_records (draft_id)
  where draft_id is not null;

-- What the model actually returned, verbatim, before anyone corrected it. The
-- review step is the only thing standing between an OCR guess and a clinical
-- record, so what the guess *was* has to survive the correction -- otherwise a
-- saved record cannot be told apart from one a human typed from scratch.
alter table public.patient_records
  add column if not exists extraction_raw jsonb;

-- ─── 2. the audit trail PatientDetail.tsx already claims exists ─────────────
-- PatientDetail.tsx says of its diagnosis edit: "The audit entry is written by
-- the patient_records_audit trigger, which records every changed column and
-- cannot be bypassed by the client." No such trigger existed -- pg_trigger was
-- empty for this table and no migration created one -- so patient_record_audit
-- held zero rows and every edit to a clinical record went unrecorded. The
-- reconstruction created the table and its append-only policies but lost the
-- trigger that fills it.

-- Canonicalises a value for comparison so a reformat is not logged as a change:
-- '170.0' and '170' are the same number, ' x ' and 'x' the same string, '' and
-- NULL both absent.
create or replace function public.norm_audit_value(_value text)
returns text language sql immutable set search_path = '' as $fn$
  select case
    when nullif(btrim(coalesce(_value, '')), '') is null then null
    when btrim(_value) ~ '^-?\d+(\.\d+)?$' then trim_scale((btrim(_value))::numeric)::text
    else btrim(_value)
  end;
$fn$;

create or replace function public.patient_records_audit()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  -- Null for a service-role or SQL-console write. Recorded as null rather than
  -- refused: an unattributed change still belongs in the trail.
  _actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.patient_record_audit
      (patient_record_id, field_name, old_value, new_value, changed_by)
    values (new.id, 'record_created', null, new.reference_number, _actor);
    return new;
  end if;

  -- One row per column that genuinely changed. Comparing the whole row as
  -- jsonb means a column added later is covered without touching this.
  insert into public.patient_record_audit
    (patient_record_id, field_name, old_value, new_value, changed_by)
  select new.id, o.key, o.value, n.value, _actor
  from jsonb_each_text(to_jsonb(old)) o
  join jsonb_each_text(to_jsonb(new)) n on n.key = o.key
  where public.norm_audit_value(o.value) is distinct from public.norm_audit_value(n.value)
    -- Bookkeeping, not clinical content: updated_at moves on every write, and
    -- the other three are set once at creation and never edited.
    and o.key not in ('updated_at', 'extraction_raw', 'draft_id', 'id');
  return new;
end;
$fn$;

-- Named to match the claim in PatientDetail.tsx.
drop trigger if exists patient_records_audit on public.patient_records;
create trigger patient_records_audit
  after insert or update on public.patient_records
  for each row execute function public.patient_records_audit();

-- ─── 3. one transaction for the whole commit ────────────────────────────────
-- The browser used to allocate a reference number in one round trip and insert
-- the row in another, which is why generate_reference_number()'s advisory lock
-- could not protect it: the lock was released with that RPC's own transaction,
-- long before the insert arrived. Two scanners could read the same MAX, and the
-- unique index turned that into a client-side retry loop.
--
-- Allocating and inserting in one call closes the window for real. It also puts
-- the permission checks and uploaded_by on the server, where the client cannot
-- get them wrong or misreport them.
--
-- SECURITY DEFINER because generate_reference_number() has to see every row to
-- pick the next number, including rows at hospitals this caller cannot read.
-- The guards below are therefore not decoration -- they are what stops this
-- being an open door, and they mirror patient_records' own insert policy.
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
language plpgsql volatile security definer set search_path = '' as $fn$
declare
  _actor uuid := auth.uid();
  _existing_id uuid;
  _existing_ref text;
  _ref text;
  _new_id uuid;
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

  _ref := public.generate_reference_number(_hospital);

  insert into public.patient_records (
    draft_id, patient_id, patient_name, hospital, uhid, age, gender,
    height_cm, weight_kg, bmi, visit_date, doctor_name, diagnosis,
    medicines, additional_documents, prescription_image_url,
    confidence_score, extraction_raw, reference_number, uploaded_by
  ) values (
    _draft_id, btrim(coalesce(_patient_id, '')), btrim(_patient_name), _hospital,
    _uhid, _age, _gender, _height_cm, _weight_kg, _bmi,
    -- The client warns when this is blank; defaulting is the behaviour it warns
    -- about, so it stays here rather than happening silently in the browser.
    coalesce(_visit_date, current_date),
    _doctor_name, _diagnosis,
    coalesce(_medicines, '[]'::jsonb), coalesce(_additional_documents, '[]'::jsonb),
    _prescription_image_url, _confidence_score, _extraction_raw, _ref, _actor
  )
  returning id into _new_id;

  -- Provenance: one row per field the operator corrected, holding what the
  -- model read and what was actually saved. extraction_raw keeps the whole
  -- response; these rows are what make the corrections legible in the record's
  -- own history, alongside every later edit.
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
      ('visit_date',   _extraction_raw->>'visit_date',   _visit_date::text),
      ('uhid',         _extraction_raw->>'uhid',         _uhid),
      ('medicines',    _extraction_raw->'medicines' #>> '{}',
                       coalesce(_medicines, '[]'::jsonb) #>> '{}')
    ) as f(field, read_value, saved_value)
    where public.norm_audit_value(f.read_value)
            is distinct from public.norm_audit_value(f.saved_value);
  end if;

  return query select _new_id, _ref;
end;
$fn$;

-- Same posture as every other function in 20260830120700_function_grants.sql:
-- nothing for anon, execute for signed-in accounts, and the function itself
-- decides whether this particular account may proceed.
revoke execute on function public.norm_audit_value(text) from public, anon;
grant  execute on function public.norm_audit_value(text) to authenticated;

revoke execute on function public.create_patient_record(
  uuid, text, text, text, text, integer, text, numeric, numeric, numeric,
  date, text, text, jsonb, jsonb, text, numeric, jsonb
) from public, anon;
grant  execute on function public.create_patient_record(
  uuid, text, text, text, text, integer, text, numeric, numeric, numeric,
  date, text, text, jsonb, jsonb, text, numeric, jsonb
) to authenticated;
