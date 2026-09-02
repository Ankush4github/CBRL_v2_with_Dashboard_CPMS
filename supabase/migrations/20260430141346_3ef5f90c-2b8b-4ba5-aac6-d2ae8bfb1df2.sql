-- Replace the broad admin "ALL" policy with scoped policies
DROP POLICY IF EXISTS "Admins can manage permissions" ON public.user_permissions;

-- Masters: full management of all user_permissions
CREATE POLICY "Masters can manage all permissions"
ON public.user_permissions
FOR ALL
TO authenticated
USING (public.is_master(auth.uid()))
WITH CHECK (public.is_master(auth.uid()));

-- Admins: can INSERT permissions only for non-admin users sharing a hospital, and not for themselves
CREATE POLICY "Admins can insert permissions for users in their hospitals"
ON public.user_permissions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND NOT public.is_admin_or_higher(user_id)
  AND public.admin_shares_hospital_with_user(auth.uid(), user_id)
);

-- Admins: can UPDATE permissions only for non-admin users sharing a hospital, and not for themselves
CREATE POLICY "Admins can update permissions for users in their hospitals"
ON public.user_permissions
FOR UPDATE
TO authenticated
USING (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND NOT public.is_admin_or_higher(user_id)
  AND public.admin_shares_hospital_with_user(auth.uid(), user_id)
)
WITH CHECK (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND NOT public.is_admin_or_higher(user_id)
  AND public.admin_shares_hospital_with_user(auth.uid(), user_id)
);

-- Admins: can DELETE permissions only for non-admin users sharing a hospital, and not for themselves
CREATE POLICY "Admins can delete permissions for users in their hospitals"
ON public.user_permissions
FOR DELETE
TO authenticated
USING (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND NOT public.is_admin_or_higher(user_id)
  AND public.admin_shares_hospital_with_user(auth.uid(), user_id)
);