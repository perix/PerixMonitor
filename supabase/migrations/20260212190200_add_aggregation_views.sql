-- =============================================================================
-- AGGREGATION VIEWS — PerixMonitor
-- =============================================================================
-- Scopo: Spostare il carico di aggregazione dal Python (Serverless RAM) al
--        Database (Postgres). Permette il calcolo istantaneo di sommatorie
--        e statistiche senza scaricare migliaia di righe via rete.
-- =============================================================================

-- 1. View: Portfolio Holdings Summary
-- Calcola la posizione netta (quantità e costo medio) per ogni asset in ogni portafoglio.
-- Sostituisce la logica Python che itera su tutte le transazioni.
CREATE OR REPLACE VIEW portfolio_holdings AS
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

-- 2. View: Dividend Totals per Asset
-- Calcola il totale dividendi e spese per asset.
CREATE OR REPLACE VIEW dividend_totals AS
SELECT 
  portfolio_id, 
  asset_id,
  SUM(amount_eur) AS total,
  SUM(CASE WHEN type='DIVIDEND' THEN amount_eur ELSE 0 END) AS total_incassi,
  SUM(CASE WHEN type='EXPENSE' THEN amount_eur ELSE 0 END) AS total_spese,
  COUNT(*) AS num_entries
FROM dividends 
GROUP BY portfolio_id, asset_id;

-- 3. View: Portfolio Metadata Stats
-- Metadati veloci per la dashboard (es. data inizio attività)
CREATE OR REPLACE VIEW portfolio_stats AS
SELECT 
    portfolio_id,
    MIN(date) as first_transaction_date,
    MAX(date) as last_transaction_date,
    COUNT(*) as transaction_count
FROM transactions
GROUP BY portfolio_id;
