INSERT INTO public.user_roles (user_id, role) VALUES ('3766fd79-a935-4745-9c2b-d1f611bf5ec9','master') ON CONFLICT (user_id, role) DO NOTHING;
INSERT INTO public.user_permissions (user_id, can_scan, can_upload, is_enabled) VALUES ('3766fd79-a935-4745-9c2b-d1f611bf5ec9', true, true, true)
ON CONFLICT (user_id) DO UPDATE SET can_scan = true, can_upload = true, is_enabled = true;