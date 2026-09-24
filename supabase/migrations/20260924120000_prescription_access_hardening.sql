-- Close three gaps between the prescriptions bucket / audit trail and the
-- hospital scoping that patient_records already enforces.

-- ─── 1. Reads follow the record's hospital ──────────────────────────────────
-- The old read policy let any enabled account read every hospital's scans.
-- Now an object is readable when it belongs to a record at a hospital the
-- caller can reach (masters reach all, via user_has_hospital_access), or when
-- the caller uploaded it themselves (an in-flight scan not yet attached to a
-- record). The PDF edge function reads with the service role and is unaffected.
create or replace function public.prescription_object_is_readable(_path text, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_records r
    where (
        r.prescription_image_url = _path
        or (
          jsonb_typeof(r.additional_documents) = 'array'
          and exists (
            select 1
            from jsonb_array_elements(r.additional_documents) d
            where d->>'url' = _path
          )
        )
      )
      and public.user_has_hospital_access(r.hospital, _user_id)
  );
$$;

revoke execute on function public.prescription_object_is_readable(text, uuid) from public, anon;
grant execute on function public.prescription_object_is_readable(text, uuid) to authenticated;

drop policy if exists "prescriptions: enabled accounts read" on storage.objects;

create policy "prescriptions: read at assigned hospitals"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'prescriptions'
    and public.user_is_enabled((select auth.uid()))
    and (
      owner_id = (select auth.uid())::text
      or public.prescription_object_is_readable(name, (select auth.uid()))
    )
  );

-- ─── 2. A saved clinical document cannot be overwritten ─────────────────────
-- Matches the guard on "uploader deletes own unreferenced": once a record
-- points at an object, it is part of the clinical record and stays as saved.
drop policy if exists "prescriptions: uploader replaces own" on storage.objects;

create policy "prescriptions: uploader replaces own unreferenced"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'prescriptions'
    and public.user_can_scan((select auth.uid()))
    and owner_id = (select auth.uid())::text
    and not public.prescription_object_is_referenced(name)
  )
  with check (
    bucket_id = 'prescriptions'
    and owner_id = (select auth.uid())::text
  );

-- ─── 3. The audit trail is written only by the database ─────────────────────
-- Rows come from the patient_records_audit trigger and create_patient_record,
-- both SECURITY DEFINER, so neither needs a client INSERT policy. Keeping one
-- let any signed-in account append rows (including ai:* provenance rows) to
-- any record.
drop policy if exists "patient_record_audit: append" on public.patient_record_audit;
