CREATE OR REPLACE FUNCTION public.generate_reference_number(_hospital text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    hospital_letter TEXT;
    current_month TEXT;
    current_year TEXT;
    prefix TEXT;
    next_number INTEGER;
BEGIN
    hospital_letter := UPPER(LEFT(TRIM(_hospital), 1));
    IF hospital_letter = '' OR hospital_letter IS NULL THEN
        hospital_letter := 'X';
    END IF;

    current_month := TO_CHAR(NOW(), 'MM');
    current_year := TO_CHAR(NOW(), 'YYYY');
    prefix := hospital_letter || current_month || current_year;

    -- Serialize on the prefix so all hospitals sharing the first letter cooperate
    PERFORM pg_advisory_xact_lock(hashtext(prefix));

    SELECT COALESCE(
      MAX(
        NULLIF(regexp_replace(substring(reference_number FROM length(prefix) + 1), '\D', '', 'g'), '')::INTEGER
      ),
      0
    ) + 1
    INTO next_number
    FROM public.patient_records
    WHERE reference_number LIKE prefix || '%'
      AND substring(reference_number FROM length(prefix) + 1) ~ '^[0-9]+$';

    RETURN prefix || next_number::TEXT;
END;
$function$;