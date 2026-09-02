-- Step 1: Add new enum values first
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'master';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'user';