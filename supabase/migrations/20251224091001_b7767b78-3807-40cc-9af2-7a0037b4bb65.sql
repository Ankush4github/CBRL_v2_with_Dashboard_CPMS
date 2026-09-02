-- Create a function to check if a user is currently enabled
CREATE OR REPLACE FUNCTION public.user_is_enabled(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM public.user_permissions WHERE user_id = _user_id),
    true -- Default to true if no permissions record exists (new users)
  )
$$;

-- Update the SELECT policy for patient_records to require:
-- 1. User must be enabled (not disabled by admin)
-- 2. User must have current hospital access (not just be the uploader)
DROP POLICY IF EXISTS "Users can view records based on role" ON public.patient_records;

CREATE POLICY "Users can view records based on role" 
ON public.patient_records 
FOR SELECT 
USING (
  user_is_enabled(auth.uid()) AND (
    is_master(auth.uid()) OR 
    (is_admin_or_higher(auth.uid()) AND user_has_hospital_access(auth.uid(), hospital)) OR 
    (auth.uid() = uploaded_by AND user_has_hospital_access(auth.uid(), hospital))
  )
);

-- Also update INSERT policy to check user is enabled
DROP POLICY IF EXISTS "Users can insert records for assigned hospitals" ON public.patient_records;

CREATE POLICY "Users can insert records for assigned hospitals" 
ON public.patient_records 
FOR INSERT 
WITH CHECK (
  auth.uid() = uploaded_by AND 
  user_is_enabled(auth.uid()) AND
  user_can_scan(auth.uid()) AND 
  user_has_hospital_access(auth.uid(), hospital)
);

-- Update UPDATE policy to check user is still enabled and has hospital access
DROP POLICY IF EXISTS "Users can update records they uploaded" ON public.patient_records;

CREATE POLICY "Users can update records they uploaded" 
ON public.patient_records 
FOR UPDATE 
USING (
  auth.uid() = uploaded_by AND 
  user_is_enabled(auth.uid()) AND
  user_has_hospital_access(auth.uid(), hospital)
);

-- Update DELETE policy to also require user to be enabled
DROP POLICY IF EXISTS "Admins can delete any record" ON public.patient_records;

CREATE POLICY "Admins can delete records for their hospitals" 
ON public.patient_records 
FOR DELETE 
USING (
  user_is_enabled(auth.uid()) AND
  is_admin_or_higher(auth.uid()) AND
  user_has_hospital_access(auth.uid(), hospital)
);