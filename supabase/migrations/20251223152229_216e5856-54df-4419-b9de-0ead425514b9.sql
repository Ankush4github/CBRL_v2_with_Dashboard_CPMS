-- Add patient_id/UHID column to patient_records table
ALTER TABLE public.patient_records 
ADD COLUMN patient_id text NOT NULL DEFAULT '';