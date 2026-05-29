
-- Allow admins to view activities, pac_records, lookahead, and progress for all projects (dashboard)
CREATE POLICY "Admins can view all activities"
ON public.activities FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can view all pac"
ON public.pac_records FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can view all lookahead"
ON public.lookahead_items FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can view all progress_cells"
ON public.progress_cells FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
