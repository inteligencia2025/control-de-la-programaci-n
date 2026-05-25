
-- Progress tracking: cell statuses per activity × unit
CREATE TABLE public.progress_cells (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  activity_key TEXT NOT NULL,
  unit_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('E','P','R','NA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, activity_key, unit_number)
);

CREATE INDEX idx_progress_cells_project ON public.progress_cells(project_id, activity_key);

ALTER TABLE public.progress_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own or assigned progress_cells"
ON public.progress_cells FOR SELECT
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = progress_cells.project_id AND (p.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), p.id))));

CREATE POLICY "Users can insert own or assigned progress_cells"
ON public.progress_cells FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = progress_cells.project_id AND (p.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), p.id))));

CREATE POLICY "Users can update own or assigned progress_cells"
ON public.progress_cells FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = progress_cells.project_id AND (p.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), p.id))));

CREATE POLICY "Users can delete own or assigned progress_cells"
ON public.progress_cells FOR DELETE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = progress_cells.project_id AND (p.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), p.id))));

CREATE TRIGGER trg_progress_cells_updated_at
BEFORE UPDATE ON public.progress_cells
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extra (non-LOB) activities tracked only in the progress module
CREATE TABLE public.progress_extra_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'extra',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_progress_extra_project ON public.progress_extra_activities(project_id);

ALTER TABLE public.progress_extra_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own or assigned progress_extra"
ON public.progress_extra_activities FOR SELECT
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = progress_extra_activities.project_id AND (p.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), p.id))));

CREATE POLICY "Users can insert own or assigned progress_extra"
ON public.progress_extra_activities FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = progress_extra_activities.project_id AND (p.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), p.id))));

CREATE POLICY "Users can update own or assigned progress_extra"
ON public.progress_extra_activities FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = progress_extra_activities.project_id AND (p.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), p.id))));

CREATE POLICY "Users can delete own or assigned progress_extra"
ON public.progress_extra_activities FOR DELETE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = progress_extra_activities.project_id AND (p.user_id = auth.uid() OR public.is_assigned_to_project(auth.uid(), p.id))));

CREATE TRIGGER trg_progress_extra_updated_at
BEFORE UPDATE ON public.progress_extra_activities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
