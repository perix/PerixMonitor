-- Add settings column to portfolio_asset_settings
ALTER TABLE public.portfolio_asset_settings 
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Update existing rows to have empty object instead of null if any
UPDATE public.portfolio_asset_settings 
SET settings = '{}'::jsonb 
WHERE settings IS NULL;
