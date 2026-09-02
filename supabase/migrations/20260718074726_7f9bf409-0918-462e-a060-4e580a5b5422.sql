
-- hospital_assignments: scope admin SELECT to shared hospitals
DROP POLICY IF EXISTS "Users can view their own hospital assignments" ON public.hospital_assignments;

CREATE POLICY "Users can view their own hospital assignments"
  ON public.hospital_assignments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_master(auth.uid())
    OR (
      public.is_admin_or_higher(auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.hospital_assignments admin_ha
        WHERE admin_ha.user_id = auth.uid()
          AND admin_ha.hospital = hospital_assignments.hospital
      )
    )
  );

-- notifications: scope admin SELECT to users sharing a hospital
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;

CREATE POLICY "Users view own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_master(auth.uid())
    OR (
      public.is_admin_or_higher(auth.uid())
      AND public.admin_shares_hospital_with_user(auth.uid(), user_id)
    )
  );
