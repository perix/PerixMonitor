-- Migration: Add last_trend_days to assets
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS last_trend_days INTEGER DEFAULT NULL;
