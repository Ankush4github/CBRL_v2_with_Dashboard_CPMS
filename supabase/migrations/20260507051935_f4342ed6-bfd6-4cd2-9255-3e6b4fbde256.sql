
CREATE OR REPLACE FUNCTION public.generate_reference_number(_hospital text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _first_letter text;
  _date_code text;
  _count int;
  _ref text;
BEGIN
  _first_letter := upper(left(trim(_hospital), 1));
  IF _first_letter = '' THEN
    _first_letter := 'X';
  END IF;

  _date_code := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'MMYY');

  -- Count existing records for this hospital today (IST), with advisory lock to serialize
  PERFORM pg_advisory_xact_lock(hashtext(_hospital || _date_code));

  SELECT count(*) INTO _count
  FROM public.patient_records
  WHERE hospital = _hospital
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;

  _ref := _first_letter || _date_code || (_count + 1)::text;

  RETURN _ref;
END;
$$;
