-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view all patient records" ON public.patient_records;

-- Create a new policy: Users can view their own uploaded records
CREATE POLICY "Users can view their own uploaded records"
ON public.patient_records
FOR SELECT
USING (auth.uid() = uploaded_by);

-- Create a policy: Admins can view all records
CREATE POLICY "Admins can view all patient records"
ON public.patient_records
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));