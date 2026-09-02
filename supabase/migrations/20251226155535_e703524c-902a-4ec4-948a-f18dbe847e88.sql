-- Add new columns to patient_records table for enhanced OCR extraction
ALTER TABLE public.patient_records 
ADD COLUMN IF NOT EXISTS height_cm numeric,
ADD COLUMN IF NOT EXISTS weight_kg numeric,
ADD COLUMN IF NOT EXISTS uhid text,
ADD COLUMN IF NOT EXISTS confidence_score integer;