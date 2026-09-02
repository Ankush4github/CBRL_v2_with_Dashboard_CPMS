CREATE OR REPLACE FUNCTION public.generate_reference_number(_hospital TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    hospital_letter TEXT;
    current_month TEXT;
    current_year TEXT;
    next_number INTEGER;
    generated_ref TEXT;
BEGIN
    hospital_letter := UPPER(LEFT(TRIM(_hospital), 1));
    IF hospital_letter = '' OR hospital_letter IS NULL THEN
        hospital_letter := 'X';
    END IF;

    current_month := TO_CHAR(NOW(), 'MM');
    current_year := TO_CHAR(NOW(), 'YYYY');

    PERFORM pg_advisory_xact_lock(hashtext(_hospital || current_month || current_year));

    SELECT COUNT(*) + 1
    INTO next_number
    FROM public.patient_records
    WHERE hospital = _hospital
      AND TO_CHAR(created_at, 'MM') = current_month
      AND TO_CHAR(created_at, 'YYYY') = current_year;

    generated_ref := hospital_letter || current_month || current_year || next_number::TEXT;

    RETURN generated_ref;
END;
$$;