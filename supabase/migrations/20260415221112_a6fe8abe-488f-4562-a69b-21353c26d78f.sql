
-- Create project_assignments table
CREATE TABLE public.project_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can manage all assignments
CREATE POLICY "Admins can manage assignments"
  ON public.project_assignments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can view their own assignments
CREATE POLICY "Users can view own assignments"
  ON public.project_assignments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Helper function to check if user is assigned to a project
CREATE OR REPLACE FUNCTION public.is_assigned_to_project(_user_id UUID, _project_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_assignments
    WHERE user_id = _user_id AND project_id = _project_id
  )
$$;

-- Update projects policies: owner OR assigned user can view
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
CREATE POLICY "Users can view own or assigned projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id OR public.is_assigned_to_project(auth.uid(), id));

-- Update projects: assigned users can also update
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update own or assigned projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id OR public.is_assigned_to_project(auth.uid(), id));

-- Restrict project creation to admins only
DROP POLICY IF EXISTS "Users can create own projects" ON public.projects;
CREATE POLICY "Admins can create projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = user_id);

-- Update activities policies to include assigned users
DROP POLICY IF EXISTS "Users can view own activities" ON public.activities;
CREATE POLICY "Users can view own or assigned activities"
  ON public.activities FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = activities.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));

DROP POLICY IF EXISTS "Users can update own activities" ON public.activities;
CREATE POLICY "Users can update own or assigned activities"
  ON public.activities FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = activities.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));

DROP POLICY IF EXISTS "Users can create own activities" ON public.activities;
CREATE POLICY "Users can create own or assigned activities"
  ON public.activities FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = activities.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));

DROP POLICY IF EXISTS "Users can delete own activities" ON public.activities;
CREATE POLICY "Users can delete own or assigned activities"
  ON public.activities FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = activities.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));

-- Update lookahead_items policies
DROP POLICY IF EXISTS "Users can view own lookahead" ON public.lookahead_items;
CREATE POLICY "Users can view own or assigned lookahead"
  ON public.lookahead_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = lookahead_items.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));

DROP POLICY IF EXISTS "Users can update own lookahead" ON public.lookahead_items;
CREATE POLICY "Users can update own or assigned lookahead"
  ON public.lookahead_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = lookahead_items.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));

DROP POLICY IF EXISTS "Users can create own lookahead" ON public.lookahead_items;
CREATE POLICY "Users can create own or assigned lookahead"
  ON public.lookahead_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = lookahead_items.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));

DROP POLICY IF EXISTS "Users can delete own lookahead" ON public.lookahead_items;
CREATE POLICY "Users can delete own or assigned lookahead"
  ON public.lookahead_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = lookahead_items.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));

-- Update pac_records policies
DROP POLICY IF EXISTS "Users can view own pac" ON public.pac_records;
CREATE POLICY "Users can view own or assigned pac"
  ON public.pac_records FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = pac_records.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));

DROP POLICY IF EXISTS "Users can update own pac" ON public.pac_records;
CREATE POLICY "Users can update own or assigned pac"
  ON public.pac_records FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = pac_records.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));

DROP POLICY IF EXISTS "Users can create own pac" ON public.pac_records;
CREATE POLICY "Users can create own or assigned pac"
  ON public.pac_records FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = pac_records.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));

DROP POLICY IF EXISTS "Users can delete own pac" ON public.pac_records;
CREATE POLICY "Users can delete own or assigned pac"
  ON public.pac_records FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = pac_records.project_id
    AND (projects.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), projects.id))
  ));
