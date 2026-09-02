
-- 1. Tighten admin SELECT on user_roles to scope by hospital
DROP POLICY IF EXISTS "Admins can view user roles" ON public.user_roles;
CREATE POLICY "Admins can view user roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    is_master(auth.uid())
    OR (is_admin_or_higher(auth.uid()) AND admin_shares_hospital_with_user(auth.uid(), user_id))
  );

-- 2. Tighten admin SELECT on user_permissions to scope by hospital
DROP POLICY IF EXISTS "Users can view their own permissions" ON public.user_permissions;
CREATE POLICY "Users can view their own permissions"
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR is_master(auth.uid())
    OR (is_admin_or_higher(auth.uid()) AND admin_shares_hospital_with_user(auth.uid(), user_id))
  );

-- 3. Change user_is_enabled default to FALSE (new users must be explicitly enabled)
CREATE OR REPLACE FUNCTION public.user_is_enabled(_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM public.user_permissions WHERE user_id = _user_id),
    false
  )
$$;

-- 4. Change user_can_scan default to FALSE (new users must be explicitly granted scan)
CREATE OR REPLACE FUNCTION public.user_can_scan(_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT can_scan AND is_enabled FROM public.user_permissions WHERE user_id = _user_id),
    false
  )
$$;
