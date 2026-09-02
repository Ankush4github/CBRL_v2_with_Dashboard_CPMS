
-- 1) patient_records UPDATE: add WITH CHECK mirroring USING
DROP POLICY IF EXISTS "Users can update records they uploaded" ON public.patient_records;
CREATE POLICY "Users can update records they uploaded"
  ON public.patient_records
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = uploaded_by
    AND public.user_is_enabled(auth.uid())
    AND public.user_has_hospital_access(auth.uid(), hospital)
  )
  WITH CHECK (
    auth.uid() = uploaded_by
    AND public.user_is_enabled(auth.uid())
    AND public.user_has_hospital_access(auth.uid(), hospital)
  );

-- 2) attendance_records: make check-in fields immutable via trigger
CREATE OR REPLACE FUNCTION public.attendance_lock_checkin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id  IS DISTINCT FROM OLD.user_id
     OR NEW.hospital IS DISTINCT FROM OLD.hospital
     OR NEW.check_in_at IS DISTINCT FROM OLD.check_in_at
     OR NEW.check_in_latitude IS DISTINCT FROM OLD.check_in_latitude
     OR NEW.check_in_longitude IS DISTINCT FROM OLD.check_in_longitude
     OR NEW.check_in_distance_meters IS DISTINCT FROM OLD.check_in_distance_meters
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Check-in fields are immutable once the record is created';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_lock_checkin ON public.attendance_records;
CREATE TRIGGER attendance_lock_checkin
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_lock_checkin_fields();

-- 3) Restrict SECURITY DEFINER function EXECUTE privileges.
-- Trigger-only functions: revoke from everyone (triggers still run as table owner).
REVOKE ALL ON FUNCTION public.handle_new_user()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attendance_lock_checkin_fields() FROM PUBLIC, anon, authenticated;

-- Helper/RPC functions: revoke from PUBLIC + anon, keep authenticated only.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role)                       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role)                   TO authenticated;

REVOKE ALL ON FUNCTION public.is_master(uuid)                                FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_master(uuid)                            TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin_or_higher(uuid)                       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin_or_higher(uuid)                   TO authenticated;

REVOKE ALL ON FUNCTION public.user_is_enabled(uuid)                          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_is_enabled(uuid)                      TO authenticated;

REVOKE ALL ON FUNCTION public.user_can_scan(uuid)                            FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_can_scan(uuid)                        TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_hospital_access(uuid, text)           FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_has_hospital_access(uuid, text)       TO authenticated;

REVOKE ALL ON FUNCTION public.admin_shares_hospital_with_user(uuid, uuid)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_shares_hospital_with_user(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_role(uuid)                            FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid)                        TO authenticated;

REVOKE ALL ON FUNCTION public.generate_reference_number(text)                FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_reference_number(text)            TO authenticated;
