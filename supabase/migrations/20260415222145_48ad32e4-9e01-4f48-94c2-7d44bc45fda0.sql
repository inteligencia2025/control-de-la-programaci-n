
DROP POLICY IF EXISTS "Users can view own or assigned projects" ON public.projects;

CREATE POLICY "Users can view own or assigned projects"
  ON public.projects FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_assigned_to_project(auth.uid(), id)
    OR public.has_role(auth.uid(), 'admin')
  );
