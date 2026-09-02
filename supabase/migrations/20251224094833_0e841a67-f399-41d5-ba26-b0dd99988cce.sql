-- Add reference_number column to patient_records
ALTER TABLE public.patient_records 
ADD COLUMN reference_number TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX idx_patient_records_reference_number ON public.patient_records(reference_number);