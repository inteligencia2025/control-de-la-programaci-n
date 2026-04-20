-- Add soft delete columns to projects
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by UUID;

CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON public.projects(deleted_at);

-- Replace SELECT policy to filter out deleted projects (admins still see them via separate policy)
DROP POLICY IF EXISTS "Users can view own or assigned projects" ON public.projects;

CREATE POLICY "Users can view own or assigned projects"
ON public.projects
FOR SELECT
USING (
  deleted_at IS NULL
  AND (
    auth.uid() = user_id
    OR is_assigned_to_project(auth.uid(), id)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Admins can also see deleted projects (for the trash bin)
CREATE POLICY "Admins can view deleted projects"
ON public.projects
FOR SELECT
USING (
  deleted_at IS NOT NULL
  AND has_role(auth.uid(), 'admin'::app_role)
);