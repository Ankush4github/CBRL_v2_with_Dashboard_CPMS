-- Drop existing delete policy
DROP POLICY IF EXISTS "Admins can delete records for their hospitals" ON public.patient_records;

-- Create new delete policy that allows:
-- 1. Master users can delete ANY record
-- 2. Admins can delete records for their assigned hospitals
CREATE POLICY "Masters and admins can delete records"
ON public.patient_records
FOR DELETE
TO authenticated
USING (
  user_is_enabled(auth.uid()) AND (
    is_master(auth.uid()) OR
    (is_admin_or_higher(auth.uid()) AND user_has_hospital_access(auth.uid(), hospital))
  )
);