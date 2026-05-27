-- Explicitly grant privileges to anon, authenticated, and service_role 
-- to support Supabase's breaking change (no automatic table exposure by default).
-- This ensures the Data API (PostgREST) can read/write to these tables.

-- 1. Tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portfolios TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assets TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.snapshots TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_config TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dividends TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.asset_metrics_history TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portfolio_asset_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.asset_notes TO authenticated, service_role;

-- 2. Materialized Views
GRANT SELECT ON TABLE public.portfolio_holdings TO authenticated, service_role;
GRANT SELECT ON TABLE public.dividend_totals TO authenticated, service_role;
GRANT SELECT ON TABLE public.portfolio_stats TO authenticated, service_role;

-- 3. Sequences (Required for auto-incrementing fields during inserts)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- 4. Functions / RPCs
GRANT EXECUTE ON FUNCTION public.refresh_materialized_views() TO authenticated, service_role;
