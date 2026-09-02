-- Add onboarding fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS clinic_name text,
ADD COLUMN IF NOT EXISTS staff_role text,
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Update RLS to allow users to complete onboarding
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);