ALTER TABLE public.pac_records 
  ADD COLUMN IF NOT EXISTS planned_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_pct numeric NOT NULL DEFAULT 0;

-- Backfill: if planned/completed booleans were used, seed percentages so old records remain consistent
UPDATE public.pac_records SET planned_pct = 100 WHERE planned = true AND planned_pct = 0;
UPDATE public.pac_records SET completed_pct = 100 WHERE completed = true AND completed_pct = 0;