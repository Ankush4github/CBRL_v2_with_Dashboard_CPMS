-- Narrow client writes on patient records to what the app actually does.
--
-- Records are created only through create_patient_record (SECURITY DEFINER,
-- owned by postgres), which allocates the reference number, enforces draft_id
-- idempotency and writes the ai:* provenance rows. The only client edit is the
-- diagnosis on PatientDetail. Both writers of patient_record_audit — the
-- patient_records_audit trigger and the RPC — are SECURITY DEFINER too, so
-- nothing below changes what the app can do.

-- ─── patient_records ────────────────────────────────────────────────────────
-- A direct INSERT skipped the RPC's reference numbering, idempotency and
-- provenance. The policy goes, and so does the grant.
drop policy if exists "patient_records: scan permission to insert" on public.patient_records;

-- The UPDATE policy stays (enabled + hospital access), but the grant shrinks to
-- the one editable column: reference_number, uploaded_by, hospital, the image
-- paths and extraction_raw are no longer writable from the client.
revoke insert, update, truncate, references, trigger on public.patient_records from anon, authenticated;
grant update (diagnosis) on public.patient_records to authenticated;

-- anon has no policy on this table, so RLS already refused it; removing the
-- remaining grants keeps that from depending on RLS alone.
revoke select, delete on public.patient_records from anon;

-- ─── patient_record_audit ───────────────────────────────────────────────────
-- Append-only and written by the database. Clients read it (with the record)
-- and nothing else.
revoke insert, update, delete, truncate, references, trigger on public.patient_record_audit from anon, authenticated;
revoke select on public.patient_record_audit from anon;
