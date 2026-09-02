-- Create audit trail table for patient record changes
CREATE TABLE public.patient_record_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_record_id UUID NOT NULL REFERENCES public.patient_records(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patient_record_audit ENABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX idx_patient_record_audit_record_id ON public.patient_record_audit(patient_record_id);
CREATE INDEX idx_patient_record_audit_changed_at ON public.patient_record_audit(changed_at DESC);

-- RLS policies: Users can view audit logs for records they have access to
CREATE POLICY "Users can view audit logs for accessible records"
ON public.patient_record_audit
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.patient_records pr
    WHERE pr.id = patient_record_id
    AND (
      public.is_master(auth.uid())
      OR (public.is_admin_or_higher(auth.uid()) AND public.user_has_hospital_access(auth.uid(), pr.hospital))
      OR (auth.uid() = pr.uploaded_by AND public.user_has_hospital_access(auth.uid(), pr.hospital))
    )
  )
);

-- Users can insert audit logs for records they can update
CREATE POLICY "Users can insert audit logs for their updates"
ON public.patient_record_audit
FOR INSERT
WITH CHECK (
  auth.uid() = changed_by
  AND EXISTS (
    SELECT 1 FROM public.patient_records pr
    WHERE pr.id = patient_record_id
    AND auth.uid() = pr.uploaded_by
    AND public.user_is_enabled(auth.uid())
    AND public.user_has_hospital_access(auth.uid(), pr.hospital)
  )
);