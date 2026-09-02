-- 1) Restrict prescriptions bucket uploads to user's own folder
DROP POLICY IF EXISTS "Authenticated users can upload prescriptions" ON storage.objects;
CREATE POLICY "Authenticated users can upload prescriptions to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'prescriptions'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Also restrict UPDATE/DELETE on prescriptions to own folder (admins/masters covered by separate policies)
DROP POLICY IF EXISTS "Users can update their own prescriptions" ON storage.objects;
CREATE POLICY "Users can update their own prescriptions"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete their own prescriptions" ON storage.objects;
CREATE POLICY "Users can delete their own prescriptions"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 2) Include masters in admin SELECT policy for prescription files
DROP POLICY IF EXISTS "Admins can view all prescriptions" ON storage.objects;
CREATE POLICY "Admins and masters can view all prescriptions"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND public.is_admin_or_higher(auth.uid())
);

-- 3) Restrict admin hospital_assignments management; only masters fully manage
DROP POLICY IF EXISTS "Admins can manage hospital assignments" ON public.hospital_assignments;

-- Masters: full management
CREATE POLICY "Masters can manage all hospital assignments"
ON public.hospital_assignments
FOR ALL
TO authenticated
USING (public.is_master(auth.uid()))
WITH CHECK (public.is_master(auth.uid()));

-- Admins: can INSERT assignments only for hospitals they themselves are assigned to,
-- and not for themselves (prevent self-escalation to additional hospitals)
CREATE POLICY "Admins can insert assignments for their hospitals"
ON public.hospital_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND EXISTS (
    SELECT 1 FROM public.hospital_assignments ha
    WHERE ha.user_id = auth.uid()
      AND ha.hospital = hospital_assignments.hospital
  )
);

-- Admins: can UPDATE assignments only within their hospitals (and not their own row)
CREATE POLICY "Admins can update assignments for their hospitals"
ON public.hospital_assignments
FOR UPDATE
TO authenticated
USING (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND EXISTS (
    SELECT 1 FROM public.hospital_assignments ha
    WHERE ha.user_id = auth.uid()
      AND ha.hospital = hospital_assignments.hospital
  )
)
WITH CHECK (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND EXISTS (
    SELECT 1 FROM public.hospital_assignments ha
    WHERE ha.user_id = auth.uid()
      AND ha.hospital = hospital_assignments.hospital
  )
);

-- Admins: can DELETE assignments only within their hospitals (and not their own row)
CREATE POLICY "Admins can delete assignments for their hospitals"
ON public.hospital_assignments
FOR DELETE
TO authenticated
USING (
  public.is_admin_or_higher(auth.uid())
  AND auth.uid() <> user_id
  AND EXISTS (
    SELECT 1 FROM public.hospital_assignments ha
    WHERE ha.user_id = auth.uid()
      AND ha.hospital = hospital_assignments.hospital
  )
);