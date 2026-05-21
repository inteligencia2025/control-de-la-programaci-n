REVOKE EXECUTE ON FUNCTION public.add_project_contractor(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_project_custom_failure_cause(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_project_contractor(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_project_custom_failure_cause(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_project_contractor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_project_custom_failure_cause(uuid, text) TO authenticated;