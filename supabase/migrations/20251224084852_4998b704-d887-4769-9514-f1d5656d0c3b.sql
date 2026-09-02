-- Step 2: Create hospital_assignments table
CREATE TABLE public.hospital_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital text NOT NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, hospital)
);

-- Step 3: Create user_permissions table
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  can_scan boolean DEFAULT true,
  can_upload boolean DEFAULT true,
  is_enabled boolean DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.hospital_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Step 4: Create helper functions for role checking
CREATE OR REPLACE FUNCTION public.is_master(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'master'::app_role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_higher(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('master'::app_role, 'admin'::app_role)
  )
$$;

CREATE OR REPLACE FUNCTION public.user_has_hospital_access(_user_id uuid, _hospital text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.is_master(_user_id) OR
    EXISTS (
      SELECT 1 FROM public.hospital_assignments
      WHERE user_id = _user_id AND hospital = _hospital
    )
$$;

CREATE OR REPLACE FUNCTION public.user_can_scan(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT can_scan AND is_enabled FROM public.user_permissions WHERE user_id = _user_id),
    true
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'master'::app_role) THEN 'master'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::app_role) THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'staff'::app_role) THEN 'user'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'user'::app_role) THEN 'user'
    ELSE 'user'
  END
$$;

-- Step 5: RLS Policies for hospital_assignments
CREATE POLICY "Users can view their own hospital assignments"
ON public.hospital_assignments FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_higher(auth.uid()));

CREATE POLICY "Admins can manage hospital assignments"
ON public.hospital_assignments FOR ALL
USING (public.is_admin_or_higher(auth.uid()));

-- Step 6: RLS Policies for user_permissions
CREATE POLICY "Users can view their own permissions"
ON public.user_permissions FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_higher(auth.uid()));

CREATE POLICY "Admins can manage permissions"
ON public.user_permissions FOR ALL
USING (public.is_admin_or_higher(auth.uid()));

-- Step 7: Update patient_records RLS policies
DROP POLICY IF EXISTS "Users can view their own uploaded records" ON public.patient_records;
DROP POLICY IF EXISTS "Admins can view all patient records" ON public.patient_records;

CREATE POLICY "Users can view records based on role"
ON public.patient_records FOR SELECT
USING (
  public.is_master(auth.uid()) OR
  (public.is_admin_or_higher(auth.uid()) AND public.user_has_hospital_access(auth.uid(), hospital)) OR
  (auth.uid() = uploaded_by)
);

DROP POLICY IF EXISTS "Authenticated users can insert patient records" ON public.patient_records;

CREATE POLICY "Users can insert records for assigned hospitals"
ON public.patient_records FOR INSERT
WITH CHECK (
  auth.uid() = uploaded_by AND
  public.user_can_scan(auth.uid()) AND
  public.user_has_hospital_access(auth.uid(), hospital)
);

-- Step 8: Update user_roles policies
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Masters can manage all roles"
ON public.user_roles FOR ALL
USING (public.is_master(auth.uid()));

CREATE POLICY "Admins can view user roles"
ON public.user_roles FOR SELECT
USING (public.is_admin_or_higher(auth.uid()));

-- Step 9: Add trigger for updated_at on user_permissions
CREATE TRIGGER update_user_permissions_updated_at
BEFORE UPDATE ON public.user_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Step 10: Update profiles policy
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view own profile or admins can view all"
ON public.profiles FOR SELECT
USING (auth.uid() = id OR public.is_admin_or_higher(auth.uid()));