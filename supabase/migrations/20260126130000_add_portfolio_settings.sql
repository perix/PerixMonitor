-- Add settings column to portfolios table
ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
