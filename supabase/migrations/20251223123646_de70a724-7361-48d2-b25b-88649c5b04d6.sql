-- Block anonymous access to patient_records table
-- Revoke all privileges from anon role first
REVOKE ALL ON public.patient_records FROM anon;

-- Block anonymous access to profiles table  
REVOKE ALL ON public.profiles FROM anon;

-- Block anonymous access to user_roles table
REVOKE ALL ON public.user_roles FROM anon;