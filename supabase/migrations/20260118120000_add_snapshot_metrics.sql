-- Add performance metrics to snapshots table
ALTER TABLE public.snapshots 
ADD COLUMN IF NOT EXISTS total_eur NUMERIC,
ADD COLUMN IF NOT EXISTS total_invested NUMERIC,
ADD COLUMN IF NOT EXISTS xirr NUMERIC;
