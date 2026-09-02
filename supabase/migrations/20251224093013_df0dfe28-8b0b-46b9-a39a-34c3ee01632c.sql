-- Fix profiles table RLS policies - change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles based on role and hospital" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create PERMISSIVE policies (default behavior)
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view profiles in their hospitals"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_master(auth.uid()) OR 
  (is_admin_or_higher(auth.uid()) AND admin_shares_hospital_with_user(auth.uid(), id))
);

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Fix user_roles table RLS policies - change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Masters can manage all roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (is_admin_or_higher(auth.uid()));

CREATE POLICY "Masters can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (is_master(auth.uid()));

-- Fix patient_records table RLS policies - change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Users can view records based on role" ON public.patient_records;
DROP POLICY IF EXISTS "Users can insert records for assigned hospitals" ON public.patient_records;
DROP POLICY IF EXISTS "Users can update records they uploaded" ON public.patient_records;
DROP POLICY IF EXISTS "Admins can delete records for their hospitals" ON public.patient_records;

CREATE POLICY "Users can view records based on role"
ON public.patient_records
FOR SELECT
TO authenticated
USING (
  user_is_enabled(auth.uid()) AND (
    is_master(auth.uid()) OR 
    (is_admin_or_higher(auth.uid()) AND user_has_hospital_access(auth.uid(), hospital)) OR 
    (auth.uid() = uploaded_by AND user_has_hospital_access(auth.uid(), hospital))
  )
);

CREATE POLICY "Users can insert records for assigned hospitals"
ON public.patient_records
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = uploaded_by AND 
  user_is_enabled(auth.uid()) AND
  user_can_scan(auth.uid()) AND 
  user_has_hospital_access(auth.uid(), hospital)
);

CREATE POLICY "Users can update records they uploaded"
ON public.patient_records
FOR UPDATE
TO authenticated
USING (
  auth.uid() = uploaded_by AND 
  user_is_enabled(auth.uid()) AND
  user_has_hospital_access(auth.uid(), hospital)
);

CREATE POLICY "Admins can delete records for their hospitals"
ON public.patient_records
FOR DELETE
TO authenticated
USING (
  user_is_enabled(auth.uid()) AND
  is_admin_or_higher(auth.uid()) AND
  user_has_hospital_access(auth.uid(), hospital)
);

-- Fix hospital_assignments table RLS policies
DROP POLICY IF EXISTS "Users can view their own hospital assignments" ON public.hospital_assignments;
DROP POLICY IF EXISTS "Admins can manage hospital assignments" ON public.hospital_assignments;

CREATE POLICY "Users can view their own hospital assignments"
ON public.hospital_assignments
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR is_admin_or_higher(auth.uid()));

CREATE POLICY "Admins can manage hospital assignments"
ON public.hospital_assignments
FOR ALL
TO authenticated
USING (is_admin_or_higher(auth.uid()));

-- Fix user_permissions table RLS policies
DROP POLICY IF EXISTS "Users can view their own permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins can manage permissions" ON public.user_permissions;

CREATE POLICY "Users can view their own permissions"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR is_admin_or_higher(auth.uid()));

CREATE POLICY "Admins can manage permissions"
ON public.user_permissions
FOR ALL
TO authenticated
USING (is_admin_or_higher(auth.uid()));