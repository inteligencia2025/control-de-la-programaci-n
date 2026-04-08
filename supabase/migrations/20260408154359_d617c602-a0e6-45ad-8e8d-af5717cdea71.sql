
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Allow trigger inserts" ON public.profiles;
DROP POLICY IF EXISTS "Allow trigger role inserts" ON public.user_roles;
DROP POLICY IF EXISTS "Allow service audit inserts" ON public.admin_audit_log;
