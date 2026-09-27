-- Covering indexes for the 11 foreign keys Supabase's performance advisor
-- flagged (lint 0001_unindexed_foreign_keys, 2026-09-27).
--
-- Each column points at a user (auth.users / profiles). Without an index,
-- deleting or changing that user makes Postgres scan the whole referencing
-- table for each constraint, and lookups such as "records uploaded by X" or
-- "history changed by X" scan too. Negligible at today's size; these tables
-- grow with every scan and edit.
--
-- `if not exists`, so running this twice is harmless.

create index if not exists hospital_assignments_assigned_by_idx   on public.hospital_assignments  (assigned_by);
create index if not exists hospitals_created_by_idx               on public.hospitals             (created_by);
create index if not exists patient_record_audit_changed_by_idx    on public.patient_record_audit  (changed_by);
create index if not exists patient_records_uploaded_by_idx        on public.patient_records       (uploaded_by);
create index if not exists site_content_updated_by_idx            on public.site_content          (updated_by);
create index if not exists site_content_versions_saved_by_idx     on public.site_content_versions (saved_by);
create index if not exists site_editors_granted_by_idx            on public.site_editors          (granted_by);
create index if not exists staff_invitations_accepted_by_idx      on public.staff_invitations     (accepted_by);
create index if not exists staff_invitations_invited_by_idx       on public.staff_invitations     (invited_by);
create index if not exists staff_invitations_revoked_by_idx       on public.staff_invitations     (revoked_by);
create index if not exists user_permissions_updated_by_idx        on public.user_permissions      (updated_by);
