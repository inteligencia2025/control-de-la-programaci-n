
-- Only admins (or owners) can update projects
DROP POLICY IF EXISTS "Users can update own or assigned projects" ON public.projects;
CREATE POLICY "Admins can update projects"
  ON public.projects FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin') OR auth.uid() = user_id
  );

-- Only admins (or owners) can delete projects
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Admins can delete projects"
  ON public.projects FOR DELETE
  USING (
    has_role(auth.uid(), 'admin') OR auth.uid() = user_id
  );
