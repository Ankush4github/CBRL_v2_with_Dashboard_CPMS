ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS radius_meters integer NOT NULL DEFAULT 200;

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital text NOT NULL,
  check_in_at timestamptz NOT NULL DEFAULT now(),
  check_in_latitude double precision NOT NULL,
  check_in_longitude double precision NOT NULL,
  check_in_distance_meters double precision,
  check_out_at timestamptz,
  check_out_latitude double precision,
  check_out_longitude double precision,
  check_out_distance_meters double precision,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_user ON public.attendance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_hospital ON public.attendance_records(hospital);
CREATE INDEX IF NOT EXISTS idx_attendance_checkin ON public.attendance_records(check_in_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own attendance"
  ON public.attendance_records AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins view attendance at their hospitals"
  ON public.attendance_records AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    public.is_master(auth.uid())
    OR (public.is_admin_or_higher(auth.uid()) AND public.user_has_hospital_access(auth.uid(), hospital))
  );

CREATE POLICY "Users insert own attendance"
  ON public.attendance_records AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_has_hospital_access(auth.uid(), hospital)
  );

CREATE POLICY "Users update own attendance"
  ON public.attendance_records AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Master deletes attendance"
  ON public.attendance_records AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (public.is_master(auth.uid()));

DROP TRIGGER IF EXISTS attendance_set_updated_at ON public.attendance_records;
CREATE TRIGGER attendance_set_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
