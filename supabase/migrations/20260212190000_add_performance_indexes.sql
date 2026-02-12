-- =============================================================================
-- PERFORMANCE INDEXES — PerixMonitor
-- =============================================================================
-- Scopo: Aggiungere indici mancanti sulle tabelle più interrogate per evitare
--         full table scan. Questi indici sono critici per le performance
--         runtime di TUTTE le pagine (Dashboard, Portfolio, Memory, Upload).
--
-- Contesto: Prima di questa migration, l'unico indice era
--   idx_asset_prices_isin_date su asset_prices(isin, date DESC).
--   Le tabelle transactions, dividends, portfolio_asset_settings e asset_notes
--   venivano interrogate con WHERE portfolio_id = X senza alcun indice,
--   causando full table scan su ogni richiesta.
-- =============================================================================

-- TRANSACTIONS: tabella più interrogata (ogni pagina fa almeno 1 query)
-- Pattern: WHERE portfolio_id = X ORDER BY date (ASC o DESC)
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_date 
  ON transactions(portfolio_id, date);

-- Pattern: WHERE portfolio_id = X AND asset_id = Y (usato in join e filtri)
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_asset 
  ON transactions(portfolio_id, asset_id);

-- DIVIDENDS: filtrata per portafoglio su Dashboard, Memory, Portfolio
CREATE INDEX IF NOT EXISTS idx_dividends_portfolio 
  ON dividends(portfolio_id);

-- Pattern: WHERE portfolio_id = X AND asset_id IN(...) (Memory, Portfolio)
CREATE INDEX IF NOT EXISTS idx_dividends_portfolio_asset 
  ON dividends(portfolio_id, asset_id);

-- PORTFOLIO_ASSET_SETTINGS: colori/settings per asset
-- Pattern: WHERE portfolio_id = X AND asset_id IN(...) (Dashboard, History)
CREATE INDEX IF NOT EXISTS idx_pas_portfolio_asset 
  ON portfolio_asset_settings(portfolio_id, asset_id);

-- ASSET_NOTES: note per asset nella Memory page
-- Pattern: WHERE portfolio_id = X
CREATE INDEX IF NOT EXISTS idx_asset_notes_portfolio 
  ON asset_notes(portfolio_id);
