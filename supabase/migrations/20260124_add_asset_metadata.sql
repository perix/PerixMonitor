-- Add metadata JSONB column to store LLM-retrieved asset information
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

COMMENT ON COLUMN public.assets.metadata IS 'LLM-retrieved asset metadata in DescrAsset.json format';
