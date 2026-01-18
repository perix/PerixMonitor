-- Database Cleanup Script
-- This script truncates all domain-specific data tables to restore an empty state for development.
-- It PRESERVES:
--   - auth.users and public.profiles (User accounts)
--   - public.app_config (Application settings)
-- 
-- It DELETES content from:
--   - public.dividends
--   - public.asset_metrics_history
--   - public.snapshots
--   - public.transactions
--   - public.asset_prices
--   - public.portfolios (and cascades to related items if not caught above)
--   - public.assets

BEGIN;

-- Disable triggers to avoid potential side-effects during mass deletion if necessary, 
-- but TRUNCATE is usually cleaner. We use CASCADE to handle foreign keys.

TRUNCATE TABLE 
    public.dividends,
    public.asset_metrics_history,
    public.snapshots,
    public.transactions,
    public.asset_prices,
    public.portfolios,
    public.assets
RESTART IDENTITY CASCADE;

COMMIT;
