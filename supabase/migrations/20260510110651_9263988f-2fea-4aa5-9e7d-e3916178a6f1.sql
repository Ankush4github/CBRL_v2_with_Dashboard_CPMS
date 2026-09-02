CREATE OR REPLACE FUNCTION public.generate_reference_number(_hospital text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _hospital_letter text;
  _current_month text;
  _current_year text;
  _next_number integer;
  _generated_ref text;
BEGIN
  _hospital_letter := upper(left(trim(_hospital), 1));
  IF _hospital_letter = '' THEN
    _hospital_letter := 'X';
  END IF;

  _current_month := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'MM');
  _current_year := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY');

  -- Serialize concurrent calls per hospital+month+year to prevent collisions
  PERFORM pg_advisory_xact_lock(hashtext(_hospital || _current_month || _current_year));

  SELECT COUNT(*) + 1
  INTO _next_number
  FROM public.patient_records
  WHERE hospital = _hospital
    AND to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'MM') = _current_month
    AND to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY') = _current_year;

  _generated_ref := _hospital_letter || _current_month || _current_year || _next_number::text;

  RETURN _generated_ref;
END;
$function$;