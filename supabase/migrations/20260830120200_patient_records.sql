-- Patient records and their audit trail.
--
-- RECONSTRUCTED — see the header of 20260830120000_core_identity.sql. This is
-- the file to review hardest: it is the one holding clinical data, and its RLS
-- policies are inferred rather than recovered.

create table public.patient_records (
  id uuid primary key default gen_random_uuid(),
  -- Insert marks patient_id optional, so it carried a default. It is the
  -- hospital-facing identifier, distinct from the surrogate `id`.
  patient_id text not null default '',
  patient_name text not null,
  hospital text not null,
  uhid text,
  age integer,
  gender text,
  height_cm numeric,
  weight_kg numeric,
  bmi numeric,
  visit_date date,
  doctor_name text,
  diagnosis text,
  medicines jsonb,
  additional_documents jsonb,
  prescription_image_url text,
  reference_number text,
  -- Set by the OCR pass in ScanPrescription.tsx.
  confidence_score numeric,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.patient_record_audit (
  id uuid primary key default gen_random_uuid(),
  -- The one foreign key the generated types actually record:
  -- patient_record_audit_patient_record_id_fkey -> patient_records.id.
  patient_record_id uuid not null
    references public.patient_records (id) on delete cascade,
  field_name text not null,
  old_value text,
  new_value text,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

-- ─── reference numbers ──────────────────────────────────────────────────────
-- Signature exact (generate_reference_number(_hospital) returns text); BODY
-- INFERRED. ScanPrescription.tsx calls it once per saved record.

create or replace function public.generate_reference_number(_hospital text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  _prefix text;
  _seq int;
begin
  -- First letters of each word in the hospital name, so "Apollo Gleneagles"
  -- becomes "AG". Falls back to 'XX' for a name with no letters in it.
  select coalesce(nullif(upper(string_agg(left(word, 1), '')), ''), 'XX')
    into _prefix
  from regexp_split_to_table(coalesce(_hospital, ''), '\s+') as word
  where word ~ '^[A-Za-z]';

  -- Per hospital, per day. Counting existing rows rather than using a sequence
  -- keeps the number readable, at the cost of needing the unique index below
  -- to catch two concurrent scans landing on the same value.
  select count(*) + 1 into _seq
  from public.patient_records
  where hospital = _hospital
    and created_at >= date_trunc('day', now());

  return _prefix || '-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(_seq::text, 4, '0');
end;
$$;

-- ─── row-level security ─────────────────────────────────────────────────────
-- ALL POLICIES INFERRED. The shape follows the security model described in
-- src/lib/supabase/config.ts: access is gated on user_is_enabled(), which is
-- COALESCE(..., false), so an account with no user_permissions row — every
-- website-only editor, and every brand-new signup — is denied outright.

alter table public.patient_records     enable row level security;
alter table public.patient_record_audit enable row level security;

-- Read: enabled accounts, and only at hospitals they are assigned to.
create policy "patient_records: read at assigned hospitals"
  on public.patient_records for select to authenticated
  using (
    public.user_is_enabled((select auth.uid()))
    and public.user_has_hospital_access(hospital, (select auth.uid()))
  );

-- Insert: additionally requires the scan permission, and the row must be
-- stamped with the account that created it.
create policy "patient_records: scan permission to insert"
  on public.patient_records for insert to authenticated
  with check (
    public.user_can_scan((select auth.uid()))
    and public.user_has_hospital_access(hospital, (select auth.uid()))
    and uploaded_by = (select auth.uid())
  );

create policy "patient_records: update at assigned hospitals"
  on public.patient_records for update to authenticated
  using (
    public.user_is_enabled((select auth.uid()))
    and public.user_has_hospital_access(hospital, (select auth.uid()))
  )
  with check (
    public.user_is_enabled((select auth.uid()))
    and public.user_has_hospital_access(hospital, (select auth.uid()))
  );

-- Delete is restricted to admins. PatientDetail.tsx exposes a "Delete Record"
-- action; nothing in the UI limits it, so the limit belongs here.
create policy "patient_records: admins delete"
  on public.patient_records for delete to authenticated
  using (
    public.is_admin_or_higher((select auth.uid()))
    and public.admin_has_hospital((select auth.uid()), hospital)
  );

-- The audit trail is append-only by design: no update or delete policy exists,
-- so even an admin cannot rewrite it.
create policy "patient_record_audit: read with the record"
  on public.patient_record_audit for select to authenticated
  using (
    exists (
      select 1 from public.patient_records r
      where r.id = patient_record_id
        and public.user_is_enabled((select auth.uid()))
        and public.user_has_hospital_access(r.hospital, (select auth.uid()))
    )
  );

create policy "patient_record_audit: append"
  on public.patient_record_audit for insert to authenticated
  with check (changed_by = (select auth.uid()));

create index patient_records_hospital_idx on public.patient_records (hospital);
create index patient_records_created_at_idx on public.patient_records (created_at desc);
create index patient_records_patient_id_idx on public.patient_records (patient_id);
create index patient_record_audit_record_idx on public.patient_record_audit (patient_record_id);
-- Guards the count-based reference number against two concurrent scans.
create unique index patient_records_reference_number_key
  on public.patient_records (reference_number)
  where reference_number is not null;
