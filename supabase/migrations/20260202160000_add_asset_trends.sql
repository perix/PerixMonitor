-- Add trend tracking columns to assets
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS last_trend_variation NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_trend_ts TIMESTAMPTZ DEFAULT NULL;

-- Seed default configuration for threshold
INSERT INTO public.app_config (key, value)
VALUES ('asset_settings', '{"priceVariationThreshold": 0.1}'::jsonb)
ON CONFLICT (key) DO NOTHING;
