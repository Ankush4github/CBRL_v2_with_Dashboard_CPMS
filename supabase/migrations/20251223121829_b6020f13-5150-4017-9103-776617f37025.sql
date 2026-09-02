-- Fix overly permissive SELECT policy on patient_records
-- Users can only view records they uploaded, admins can view all

DROP POLICY IF EXISTS "Authenticated users can view patient records" ON public.patient_records;

-- Users can view their own uploaded records
CREATE POLICY "Users can view their own uploaded records" 
ON public.patient_records 
FOR SELECT 
TO authenticated
USING (auth.uid() = uploaded_by);

-- Admins can view all records
CREATE POLICY "Admins can view all patient records" 
ON public.patient_records 
FOR SELECT 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));