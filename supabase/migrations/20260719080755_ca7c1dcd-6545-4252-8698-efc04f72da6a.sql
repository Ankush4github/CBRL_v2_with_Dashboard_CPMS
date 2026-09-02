
-- 1) Revoke EXECUTE on all SECURITY DEFINER helper functions from anon/PUBLIC
REVOKE EXECUTE ON FUNCTION public.admin_has_hospital(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_is_enabled(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_hospital_access(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_higher(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_shares_hospital_with_user(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_master(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_scan(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_reference_number(text) FROM anon, PUBLIC;

-- 2) Explicit INSERT policy for notifications: only masters may insert via API.
--    Edge functions/cron use the service role, which bypasses RLS.
DROP POLICY IF EXISTS "Only masters can insert notifications" ON public.notifications;
CREATE POLICY "Only masters can insert notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_master(auth.uid()));

-- 3) Lock uploaded_by / hospital on patient_records via BEFORE UPDATE trigger.
--    Masters may still reassign; regular uploaders cannot change these fields.
CREATE OR REPLACE FUNCTION public.patient_records_lock_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_master(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
    RAISE EXCEPTION 'uploaded_by cannot be changed after record creation'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.hospital IS DISTINCT FROM OLD.hospital THEN
    RAISE EXCEPTION 'hospital cannot be reassigned after record creation'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reference_number IS DISTINCT FROM OLD.reference_number THEN
    RAISE EXCEPTION 'reference_number is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.patient_records_lock_immutable_fields() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS patient_records_lock_immutable ON public.patient_records;
CREATE TRIGGER patient_records_lock_immutable
BEFORE UPDATE ON public.patient_records
FOR EACH ROW EXECUTE FUNCTION public.patient_records_lock_immutable_fields();
