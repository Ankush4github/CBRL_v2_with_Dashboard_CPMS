-- Drop the existing permissive policy that allows all authenticated users to read
DROP POLICY IF EXISTS "Authenticated users can view hospitals" ON public.hospitals;

-- Create a more restrictive policy: users can only see hospitals they're assigned to, masters see all
CREATE POLICY "Users can view assigned hospitals or masters see all" 
ON public.hospitals 
FOR SELECT 
USING (
  public.is_master(auth.uid()) OR
  EXISTS (
    SELECT 1 FROM public.hospital_assignments
    WHERE hospital_assignments.user_id = auth.uid()
    AND hospital_assignments.hospital = hospitals.name
  )
);