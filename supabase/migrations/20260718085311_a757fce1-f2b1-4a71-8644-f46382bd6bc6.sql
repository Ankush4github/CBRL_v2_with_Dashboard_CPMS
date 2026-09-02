-- Per-hospital working hours + attendance window enforcement

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS work_start_time TIME NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS work_end_time   TIME NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS work_days       INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5];

COMMENT ON COLUMN public.hospitals.work_days IS 'ISO day-of-week integers allowed for attendance (1=Mon .. 7=Sun), evaluated in Asia/Kolkata.';

CREATE OR REPLACE FUNCTION public.attendance_enforce_working_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h RECORD;
  ist_now TIMESTAMP;
  ist_time TIME;
  ist_dow INT;
BEGIN
  SELECT work_start_time, work_end_time, work_days
    INTO h
  FROM public.hospitals
  WHERE name = NEW.hospital
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW; -- unknown hospital: don't block
  END IF;

  ist_now  := (now() AT TIME ZONE 'Asia/Kolkata');
  ist_time := ist_now::time;
  ist_dow  := EXTRACT(ISODOW FROM ist_now)::INT;

  IF NOT (ist_dow = ANY(h.work_days)) THEN
    RAISE EXCEPTION 'Attendance is only allowed on working days for %', NEW.hospital
      USING ERRCODE = 'check_violation';
  END IF;

  IF ist_time < h.work_start_time OR ist_time > h.work_end_time THEN
    RAISE EXCEPTION 'Attendance for % is only allowed between % and % IST',
      NEW.hospital, h.work_start_time, h.work_end_time
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_working_hours_insert ON public.attendance_records;
CREATE TRIGGER attendance_working_hours_insert
  BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_enforce_working_hours();

DROP TRIGGER IF EXISTS attendance_working_hours_checkout ON public.attendance_records;
CREATE TRIGGER attendance_working_hours_checkout
  BEFORE UPDATE OF check_out_at ON public.attendance_records
  FOR EACH ROW
  WHEN (OLD.check_out_at IS NULL AND NEW.check_out_at IS NOT NULL)
  EXECUTE FUNCTION public.attendance_enforce_working_hours();