-- Stop create_patient_record() logging a medicines correction that never
-- happened.
--
-- Both provenance probes against the live project produced this row:
--
--   ai:medicines   scan read: (nothing)   saved as: []
--
-- because a response with no "medicines" key makes
-- _extraction_raw->'medicines' null, while the saved value defaults to '[]'.
-- Null and '[]' are not distinct in meaning -- the model read no medicines and
-- none were saved -- but they are distinct as text, so every such scan recorded
-- a correction nobody made.
--
-- A false entry in a clinical audit trail is worse than a missing one: the
-- whole point of these rows is that a reader can trust that a listed field was
-- actually changed by a person. Coalescing the model's side to '[]' makes
-- absent and empty the same thing, which is what they are.
--
-- Only that one VALUES entry differs from 20260908140000.
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
      ('uhid',         _extraction_raw->>'uhid',         _uhid),
      ('medicines',    coalesce(_extraction_raw->'medicines', '[]'::jsonb) #>> '{}',
                       coalesce(_medicines, '[]'::jsonb) #>> '{}')
    ) as f(field, read_value, saved_value)
    where public.norm_audit_value(f.read_value)
            is distinct from public.norm_audit_value(f.saved_value);
  end if;

  return query select _new_id, _ref;
end;
$fn$;

revoke execute on function public.create_patient_record(
  uuid, text, text, text, text, integer, text, numeric, numeric, numeric,
  date, text, text, jsonb, jsonb, text, numeric, jsonb
) from public, anon;
grant  execute on function public.create_patient_record(
  uuid, text, text, text, text, integer, text, numeric, numeric, numeric,
  date, text, text, jsonb, jsonb, text, numeric, jsonb
) to authenticated;
