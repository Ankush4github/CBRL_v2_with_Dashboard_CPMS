-- Scan Prescription workflow, P0 fixes.
--
-- Two independent problems, both in the commit half of the scan flow.

-- ─── 1. reference numbers ───────────────────────────────────────────────────
-- The reconstruction in 20260830120200_patient_records.sql flagged this body as
-- INFERRED, and the guess was wrong in a way that can wedge the flow:
--
--   select count(*) + 1 ... where hospital = _hospital and created_at >= today
--
-- Deriving the sequence from a COUNT means any hole makes the next scan collide
-- with a number that already exists. Delete one record created today and the
-- next save fails; ScanPrescription.tsx retries, but a failed insert does not
-- change the count, so all five attempts regenerate the identical value and the
-- save fails for good with "Could not generate a unique reference number."
--
-- The prefix was per-initials while the count was per exact hospital name, so
-- two hospitals sharing initials ("Apollo Gleneagles" / "Apollo General" -> AG)
-- kept independent counters over one shared namespace and hit the same wedge.
--
-- This restores the body that was actually in production before the
-- reconstruction lost it (20260510112937), unchanged in behaviour: MAX of the
-- sequences already issued under this prefix, plus one. MAX steps over holes,
-- so a deletion can no longer produce a duplicate, and a retry after a
-- concurrent save now sees the committed row and moves up.
--
-- It also restores the documented format -- hospital's first letter + MM + YYYY
-- + sequence, e.g. F0720261 -- which is what Help.tsx and the README describe
-- and what the count-based version had silently changed to F-20260720-0001.
--
-- The advisory lock only spans this function's own transaction, so generate and
-- insert being two round trips still leaves a narrow window where two clients
-- read the same MAX. The unique index on reference_number catches that and the
-- client retry now resolves it. Closing the window properly means allocating
-- the number and inserting the row in one transaction; that is the follow-up,
-- and it is what removes the retry loop from the client.
create or replace function public.generate_reference_number(_hospital text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  _prefix text;
  _next_number integer;
  _hospital_letter text;
begin
  _hospital_letter := upper(left(trim(coalesce(_hospital, '')), 1));
  if _hospital_letter = '' or _hospital_letter is null then
    _hospital_letter := 'X';
  end if;

  _prefix := _hospital_letter || to_char(now(), 'MM') || to_char(now(), 'YYYY');

  -- Serialize on the prefix so all hospitals sharing the first letter cooperate.
  perform pg_advisory_xact_lock(hashtext(_prefix));

  select coalesce(
           max(
             nullif(
               regexp_replace(substring(reference_number from length(_prefix) + 1), '\D', '', 'g'),
               ''
             )::integer
           ),
           0
         ) + 1
    into _next_number
  from public.patient_records
  where reference_number like _prefix || '%'
    and substring(reference_number from length(_prefix) + 1) ~ '^[0-9]+$';

  return _prefix || _next_number::text;
end;
$$;

-- ─── 2. cleaning up uploads that never became a record ──────────────────────
-- 20260830120600_storage.sql grants delete on the prescriptions bucket to
-- admins only. ScanPrescription.tsx's failure path calls storage.remove() to
-- undo the uploads it just made, so for every ordinary scanner -- the accounts
-- that actually create the mess -- that call is a silent no-op and the files
-- stay in the bucket with no row referencing them.
--
-- Widening the admin policy is the wrong fix: these are clinical documents, and
-- a scanner must not be able to delete one that a saved record points at. This
-- grants exactly the missing capability instead -- your own upload, and only
-- while nothing references it.
--
-- SECURITY DEFINER is load-bearing here rather than incidental. Under the
-- caller's own RLS a scanner cannot see patient_records rows at hospitals they
-- are not assigned to, so the reference check would come back false for a file
-- that is in fact in use, and the policy would allow the delete.
create or replace function public.prescription_object_is_referenced(_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.patient_records r
    where r.prescription_image_url = _path
       or (
         jsonb_typeof(r.additional_documents) = 'array'
         and exists (
           select 1
           from jsonb_array_elements(r.additional_documents) d
           where d->>'url' = _path
         )
       )
  );
$$;

revoke execute on function public.prescription_object_is_referenced(text) from public, anon;
grant  execute on function public.prescription_object_is_referenced(text) to authenticated;

create policy "prescriptions: uploader deletes own unreferenced"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'prescriptions'
    and owner_id = (select auth.uid())::text
    and public.user_can_scan((select auth.uid()))
    and not public.prescription_object_is_referenced(name)
  );
