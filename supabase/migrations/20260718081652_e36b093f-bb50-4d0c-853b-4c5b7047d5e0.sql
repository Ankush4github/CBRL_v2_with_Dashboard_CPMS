
CREATE OR REPLACE FUNCTION public.admin_has_hospital(_admin_id uuid, _hospital text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hospital_assignments
    WHERE user_id = _admin_id AND hospital = _hospital
  )
$$;

DROP POLICY IF EXISTS "Admins can delete assignments for their hospitals" ON public.hospital_assignments;
DROP POLICY IF EXISTS "Admins can insert assignments for their hospitals" ON public.hospital_assignments;
DROP POLICY IF EXISTS "Admins can update assignments for their hospitals" ON public.hospital_assignments;
DROP POLICY IF EXISTS "Users can view their own hospital assignments" ON public.hospital_assignments;

CREATE POLICY "Admins can delete assignments for their hospitals"
ON public.hospital_assignments FOR DELETE
USING (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND public.admin_has_hospital(auth.uid(), hospital)
);

CREATE POLICY "Admins can insert assignments for their hospitals"
ON public.hospital_assignments FOR INSERT
WITH CHECK (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND public.admin_has_hospital(auth.uid(), hospital)
);

CREATE POLICY "Admins can update assignments for their hospitals"
ON public.hospital_assignments FOR UPDATE
USING (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND public.admin_has_hospital(auth.uid(), hospital)
)
WITH CHECK (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND public.admin_has_hospital(auth.uid(), hospital)
);

CREATE POLICY "Users can view their own hospital assignments"
ON public.hospital_assignments FOR SELECT
USING (
  auth.uid() = user_id
  OR public.is_master(auth.uid())
  OR (public.is_admin_or_higher(auth.uid()) AND public.admin_has_hospital(auth.uid(), hospital))
);
