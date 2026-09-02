-- Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Manually create profiles for existing users who don't have one
INSERT INTO public.profiles (id, email, full_name, avatar_url)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  u.raw_user_meta_data ->> 'avatar_url'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Create default staff role for existing users who don't have one
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'staff'::app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL;