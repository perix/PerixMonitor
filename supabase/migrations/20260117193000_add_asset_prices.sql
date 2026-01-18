-- Create asset_prices table to store historical price snapshots
CREATE TABLE IF NOT EXISTS asset_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    isin TEXT NOT NULL,
    price DECIMAL(15, 5) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    date DATE NOT NULL,
    source TEXT DEFAULT 'Manual Upload',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure we don't duplicate price for same asset on same day from same source
    UNIQUE(isin, date, source)
);

-- Index for fast lookup by ISIN and Date
CREATE INDEX IF NOT EXISTS idx_asset_prices_isin_date ON asset_prices(isin, date DESC);

-- Grant access to authenticated users (if RLS is enabled, but for now we follow existing pattern)
GRANT ALL ON asset_prices TO authenticated;
GRANT ALL ON asset_prices TO service_role;
