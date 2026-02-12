-- =============================================================================
-- MATERIALIZED VIEWS MIGRATION — PerixMonitor
-- =============================================================================
-- Purpose: Convert standard views to Materialized Views to cache complex aggregations.
--          add indexes for performance, and a function to refresh them.
-- =============================================================================

-- 1. Drop existing standard views (if they exist)
DROP VIEW IF EXISTS portfolio_holdings;
DROP VIEW IF EXISTS dividend_totals;
DROP VIEW IF EXISTS portfolio_stats;

-- 2. Create Materialized View: Portfolio Holdings Summary
CREATE MATERIALIZED VIEW portfolio_holdings AS
SELECT 
  t.portfolio_id,
  a.id AS asset_id, 
  a.isin, 
  a.name, 
  a.asset_class,
  a.last_trend_variation,
  SUM(CASE WHEN t.type='BUY' THEN t.quantity ELSE -t.quantity END) AS qty,
  SUM(CASE WHEN t.type='BUY' THEN (t.quantity * t.price_eur) 
       ELSE -(t.quantity * t.price_eur) END) AS net_invested,
  COUNT(*) as num_transactions,
  MAX(t.date) as last_transaction_date
FROM transactions t 
JOIN assets a ON t.asset_id = a.id
GROUP BY t.portfolio_id, a.id, a.isin, a.name, a.asset_class, a.last_trend_variation;

-- Index for lookup by portfolio
CREATE INDEX idx_mv_holdings_portfolio ON portfolio_holdings(portfolio_id);
-- Unique index for concurrent refresh (optional, but good practice)
CREATE UNIQUE INDEX idx_mv_holdings_unique ON portfolio_holdings(portfolio_id, asset_id);


-- 3. Create Materialized View: Dividend Totals per Asset
CREATE MATERIALIZED VIEW dividend_totals AS
SELECT 
  portfolio_id, 
  asset_id,
  SUM(amount_eur) AS total,
  SUM(CASE WHEN type='DIVIDEND' THEN amount_eur ELSE 0 END) AS total_incassi,
  SUM(CASE WHEN type='EXPENSE' THEN amount_eur ELSE 0 END) AS total_spese,
  COUNT(*) AS num_entries
FROM dividends 
GROUP BY portfolio_id, asset_id;

-- Index
CREATE INDEX idx_mv_dividends_portfolio ON dividend_totals(portfolio_id);
CREATE UNIQUE INDEX idx_mv_dividends_unique ON dividend_totals(portfolio_id, asset_id);


-- 4. Create Materialized View: Portfolio Metadata Stats
CREATE MATERIALIZED VIEW portfolio_stats AS
SELECT 
    portfolio_id,
    MIN(date) as first_transaction_date,
    MAX(date) as last_transaction_date,
    COUNT(*) as transaction_count
FROM transactions
GROUP BY portfolio_id;

-- Index
CREATE UNIQUE INDEX idx_mv_stats_unique ON portfolio_stats(portfolio_id);


-- 5. Create Refresh Function (RPC)
-- This function will be called by the backend after Sync/Ingest
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
  -- Refresh views concurrently to avoid locking reads
  -- Note: CONCURRENTLY requires a UNIQUE index on the view
  REFRESH MATERIALIZED VIEW CONCURRENTLY portfolio_holdings;
  REFRESH MATERIALIZED VIEW CONCURRENTLY dividend_totals;
  REFRESH MATERIALIZED VIEW CONCURRENTLY portfolio_stats;
END;
$$ LANGUAGE plpgsql;
