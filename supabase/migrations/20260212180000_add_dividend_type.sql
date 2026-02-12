-- Add 'type' column to dividends table to distinguish dividends from expenses
-- Type: 'DIVIDEND' for positive cash flows (coupons, dividends)
--       'EXPENSE' for negative cash flows (fees, taxes, costs)

-- Step 1: Drop the old unique constraint
ALTER TABLE dividends DROP CONSTRAINT IF EXISTS dividends_portfolio_id_asset_id_date_key;

-- Step 2: Add the type column with a default of 'DIVIDEND'
-- Existing entries keep 'DIVIDEND' as default (they were all treated as dividends before)
ALTER TABLE dividends ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'DIVIDEND';

-- Step 3: Backfill: reclassify existing negative amounts as 'EXPENSE'
UPDATE dividends SET type = 'EXPENSE' WHERE amount_eur < 0;

-- Step 4: Add new unique constraint including type
-- This allows a DIVIDEND and an EXPENSE on the same date for the same asset
ALTER TABLE dividends ADD CONSTRAINT dividends_portfolio_id_asset_id_date_type_key 
    UNIQUE (portfolio_id, asset_id, date, type);
