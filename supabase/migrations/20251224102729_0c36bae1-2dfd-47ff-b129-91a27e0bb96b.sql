-- Create hospitals table
CREATE TABLE public.hospitals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

-- Everyone can view hospitals (needed for dropdowns)
CREATE POLICY "Authenticated users can view hospitals"
ON public.hospitals
FOR SELECT
TO authenticated
USING (true);

-- Only masters can manage hospitals
CREATE POLICY "Masters can insert hospitals"
ON public.hospitals
FOR INSERT
TO authenticated
WITH CHECK (is_master(auth.uid()));

CREATE POLICY "Masters can update hospitals"
ON public.hospitals
FOR UPDATE
TO authenticated
USING (is_master(auth.uid()));

CREATE POLICY "Masters can delete hospitals"
ON public.hospitals
FOR DELETE
TO authenticated
USING (is_master(auth.uid()));

-- Migrate existing hospitals from patient_records
INSERT INTO public.hospitals (name)
SELECT DISTINCT hospital FROM public.patient_records WHERE hospital IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Also migrate from hospital_assignments
INSERT INTO public.hospitals (name)
SELECT DISTINCT hospital FROM public.hospital_assignments WHERE hospital IS NOT NULL
ON CONFLICT (name) DO NOTHING;