-- Add text column for markdown/text LLM responses
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS metadata_text TEXT DEFAULT NULL;

COMMENT ON COLUMN public.assets.metadata_text IS 'LLM-retrieved asset info in text/markdown format (used when response is not valid JSON)';
