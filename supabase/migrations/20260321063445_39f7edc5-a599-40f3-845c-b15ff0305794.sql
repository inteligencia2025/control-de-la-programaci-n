
-- Projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Nuevo Proyecto',
  project_type TEXT NOT NULL DEFAULT 'casas',
  building_config JSONB NOT NULL DEFAULT '{"floors":10,"unitsPerFloor":4}',
  contractors TEXT[] NOT NULL DEFAULT '{}',
  responsibles TEXT[] NOT NULL DEFAULT '{}',
  custom_failure_causes TEXT[] NOT NULL DEFAULT '{}',
  project_start_date TEXT,
  default_units INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activities table
CREATE TABLE public.activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  unit_start INTEGER NOT NULL DEFAULT 1,
  unit_end INTEGER NOT NULL DEFAULT 10,
  start_date TEXT NOT NULL,
  rate NUMERIC NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#1e3a5f',
  category TEXT NOT NULL DEFAULT 'estructura',
  predecessor_id TEXT,
  buffer_days NUMERIC NOT NULL DEFAULT 0,
  buffer_units NUMERIC NOT NULL DEFAULT 0,
  crews INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookahead items table
CREATE TABLE public.lookahead_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  activity_id TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  responsible TEXT NOT NULL DEFAULT '',
  week INTEGER NOT NULL DEFAULT 1,
  restrictions JSONB NOT NULL DEFAULT '{}',
  commitment TEXT,
  commitment_date TEXT,
  commitment_met BOOLEAN,
  commitment_cause TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PAC records table
CREATE TABLE public.pac_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  date TEXT NOT NULL,
  week_number INTEGER NOT NULL DEFAULT 1,
  activity_name TEXT NOT NULL,
  responsible TEXT NOT NULL DEFAULT '',
  planned BOOLEAN NOT NULL DEFAULT true,
  completed BOOLEAN NOT NULL DEFAULT false,
  failure_cause TEXT NOT NULL DEFAULT '',
  failure_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookahead_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pac_records ENABLE ROW LEVEL SECURITY;

-- Projects policies
CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- Activities policies (via project ownership)
CREATE POLICY "Users can view own activities" ON public.activities FOR SELECT USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = activities.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can create own activities" ON public.activities FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = activities.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can update own activities" ON public.activities FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = activities.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can delete own activities" ON public.activities FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = activities.project_id AND projects.user_id = auth.uid()));

-- Lookahead policies
CREATE POLICY "Users can view own lookahead" ON public.lookahead_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = lookahead_items.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can create own lookahead" ON public.lookahead_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = lookahead_items.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can update own lookahead" ON public.lookahead_items FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = lookahead_items.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can delete own lookahead" ON public.lookahead_items FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = lookahead_items.project_id AND projects.user_id = auth.uid()));

-- PAC policies
CREATE POLICY "Users can view own pac" ON public.pac_records FOR SELECT USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = pac_records.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can create own pac" ON public.pac_records FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = pac_records.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can update own pac" ON public.pac_records FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = pac_records.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can delete own pac" ON public.pac_records FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = pac_records.project_id AND projects.user_id = auth.uid()));
