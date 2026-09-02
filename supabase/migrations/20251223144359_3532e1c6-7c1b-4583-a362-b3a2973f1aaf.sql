-- Drop the restrictive SELECT policies
DROP POLICY IF EXISTS "Users can view their own uploaded records" ON public.patient_records;
DROP POLICY IF EXISTS "Admins can view all patient records" ON public.patient_records;

-- Create a new policy that allows all authenticated users to view all records
CREATE POLICY "Authenticated users can view all patient records" 
ON public.patient_records 
FOR SELECT 
USING (auth.uid() IS NOT NULL);