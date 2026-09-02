REVOKE ALL ON FUNCTION public.attendance_enforce_working_hours() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attendance_enforce_geofence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_enforce_working_hours() TO service_role;
GRANT EXECUTE ON FUNCTION public.attendance_enforce_geofence() TO service_role;