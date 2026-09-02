-- Create function to check if admin shares a hospital with the target user
CREATE OR REPLACE FUNCTION public.admin_shares_hospital_with_user(_admin_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.hospital_assignments admin_hospitals
    INNER JOIN public.hospital_assignments target_hospitals 
      ON admin_hospitals.hospital = target_hospitals.hospital
    WHERE admin_hospitals.user_id = _admin_id 
      AND target_hospitals.user_id = _target_user_id
  )
$$;

-- Update the SELECT policy for profiles to limit admin access
DROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON public.profiles;

CREATE POLICY "Users can view profiles based on role and hospital" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = id OR 
  is_master(auth.uid()) OR 
  (is_admin_or_higher(auth.uid()) AND admin_shares_hospital_with_user(auth.uid(), id))
);