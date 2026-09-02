-- Make prescriptions bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'prescriptions';

-- Remove the public SELECT policy
DROP POLICY IF EXISTS "Anyone can view prescriptions" ON storage.objects;

-- Add authenticated-only policies for prescriptions bucket
CREATE POLICY "Authenticated users can view prescriptions they uploaded"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'prescriptions' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Admins can view all prescriptions
CREATE POLICY "Admins can view all prescriptions"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'prescriptions' AND public.has_role(auth.uid(), 'admin'));