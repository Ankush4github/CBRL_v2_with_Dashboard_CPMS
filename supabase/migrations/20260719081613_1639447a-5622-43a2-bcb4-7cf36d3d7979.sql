
-- 1) Server-side geofence enforcement for attendance
CREATE OR REPLACE FUNCTION public.attendance_enforce_geofence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h RECORD;
  computed_in NUMERIC;
  computed_out NUMERIC;
BEGIN
  SELECT latitude, longitude, radius_meters
    INTO h
  FROM public.hospitals
  WHERE name = NEW.hospital
  LIMIT 1;

  IF NOT FOUND OR h.latitude IS NULL OR h.longitude IS NULL THEN
    RAISE EXCEPTION 'Hospital location is not configured for %', NEW.hospital
      USING ERRCODE = 'check_violation';
  END IF;

  -- Haversine distance (meters) for check-in
  computed_in := 2 * 6371000 * asin(
    sqrt(
      power(sin(radians((NEW.check_in_latitude  - h.latitude)  / 2)), 2) +
      cos(radians(h.latitude)) * cos(radians(NEW.check_in_latitude)) *
      power(sin(radians((NEW.check_in_longitude - h.longitude) / 2)), 2)
    )
  );

  IF computed_in > COALESCE(h.radius_meters, 100) THEN
    RAISE EXCEPTION 'Check-in location is outside the allowed radius for %', NEW.hospital
      USING ERRCODE = 'check_violation';
  END IF;

  -- Overwrite client-submitted distance with server-computed value
  NEW.check_in_distance_meters := computed_in;

  -- Check-out (if present)
  IF NEW.check_out_latitude IS NOT NULL AND NEW.check_out_longitude IS NOT NULL THEN
    computed_out := 2 * 6371000 * asin(
      sqrt(
        power(sin(radians((NEW.check_out_latitude  - h.latitude)  / 2)), 2) +
        cos(radians(h.latitude)) * cos(radians(NEW.check_out_latitude)) *
        power(sin(radians((NEW.check_out_longitude - h.longitude) / 2)), 2)
      )
    );

    IF computed_out > COALESCE(h.radius_meters, 100) THEN
      RAISE EXCEPTION 'Check-out location is outside the allowed radius for %', NEW.hospital
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.check_out_distance_meters := computed_out;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_enforce_geofence_ins ON public.attendance_records;
CREATE TRIGGER attendance_enforce_geofence_ins
  BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_enforce_geofence();

DROP TRIGGER IF EXISTS attendance_enforce_geofence_upd ON public.attendance_records;
CREATE TRIGGER attendance_enforce_geofence_upd
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_enforce_geofence();

-- Ensure working-hours trigger is attached on both INSERT and UPDATE
DROP TRIGGER IF EXISTS attendance_working_hours_ins ON public.attendance_records;
CREATE TRIGGER attendance_working_hours_ins
  BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_enforce_working_hours();

DROP TRIGGER IF EXISTS attendance_working_hours_upd ON public.attendance_records;
CREATE TRIGGER attendance_working_hours_upd
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_enforce_working_hours();

-- 2) Revoke EXECUTE from anon/PUBLIC on SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.admin_has_hospital(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_shares_hospital_with_user(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_higher(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_master(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_is_enabled(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_can_scan(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_hospital_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_reference_number(text) FROM PUBLIC, anon;
