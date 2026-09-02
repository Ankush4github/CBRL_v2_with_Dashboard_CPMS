-- Add column for additional documents (lab reports, scans, discharge summaries)
ALTER TABLE public.patient_records 
ADD COLUMN additional_documents jsonb DEFAULT '[]'::jsonb;