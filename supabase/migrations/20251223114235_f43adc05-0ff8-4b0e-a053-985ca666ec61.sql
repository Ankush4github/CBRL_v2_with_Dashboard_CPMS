-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  UNIQUE (user_id, role)
);

-- Create patient_records table
CREATE TABLE public.patient_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  hospital TEXT NOT NULL,
  doctor_name TEXT,
  diagnosis TEXT,
  medicines JSONB DEFAULT '[]'::jsonb,
  visit_date DATE DEFAULT CURRENT_DATE,
  prescription_image_url TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_records ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- User roles policies (only admins can manage roles)
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Patient records policies
CREATE POLICY "Authenticated users can view patient records"
  ON public.patient_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert patient records"
  ON public.patient_records FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can update records they uploaded"
  ON public.patient_records FOR UPDATE
  TO authenticated
  USING (auth.uid() = uploaded_by);

CREATE POLICY "Admins can delete any record"
  ON public.patient_records FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  
  -- Assign default staff role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff');
  
  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_patient_records_updated_at
  BEFORE UPDATE ON public.patient_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for prescriptions
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescriptions', 'prescriptions', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload prescriptions"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'prescriptions');

CREATE POLICY "Anyone can view prescriptions"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'prescriptions');

CREATE POLICY "Users can update their own uploads"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'prescriptions' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own uploads"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'prescriptions' AND auth.uid()::text = (storage.foldername(name))[1]);