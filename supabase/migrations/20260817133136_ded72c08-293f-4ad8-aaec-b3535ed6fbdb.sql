ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS checkin_deadline time NOT NULL DEFAULT '11:00:00',
  ADD COLUMN IF NOT EXISTS checkout_deadline time NOT NULL DEFAULT '18:00:00';

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS check_in_late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_out_late boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.attendance_flag_late()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h RECORD;
BEGIN
  SELECT checkin_deadline, checkout_deadline
    INTO h
  FROM public.hospitals
  WHERE name = NEW.hospital
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.check_in_late :=
      ((NEW.check_in_at AT TIME ZONE 'Asia/Kolkata')::time > h.checkin_deadline);
  ELSE
    NEW.check_in_late := OLD.check_in_late;
  END IF;

  IF NEW.check_out_at IS NOT NULL THEN
    NEW.check_out_late :=
      ((NEW.check_out_at AT TIME ZONE 'Asia/Kolkata')::time > h.checkout_deadline);
  ELSE
    NEW.check_out_late := false;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_flag_late() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_flag_late() TO service_role;

DROP TRIGGER IF EXISTS attendance_flag_late_ins ON public.attendance_records;
CREATE TRIGGER attendance_flag_late_ins
  BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_flag_late();

DROP TRIGGER IF EXISTS attendance_flag_late_upd ON public.attendance_records;
CREATE TRIGGER attendance_flag_late_upd
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_flag_late();