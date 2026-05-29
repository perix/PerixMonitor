-- Migration: add_certificates
-- Tabelle per l'analisi dei Certificati di Investimento, integrate da
-- Python-analisi-Certificato. Master data globale (PK isin, niente portfolio_id),
-- come la tabella assets. Accesso esclusivo dal backend Python via SERVICE_ROLE.

-- ============================================================================
-- 1. Tabelle
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.certificates (
    isin TEXT PRIMARY KEY,
    expiry_date TEXT,
    barrier_pct NUMERIC,
    barrier_type TEXT,
    coupon_pct NUMERIC,
    coupon_freq TEXT,
    has_memory BOOLEAN,
    is_autocallable BOOLEAN,
    trigger_level NUMERIC,
    next_coupon_date TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.underlyings (
    id BIGSERIAL PRIMARY KEY,
    isin TEXT REFERENCES public.certificates(isin) ON DELETE CASCADE,
    name TEXT,
    original_ticker TEXT,
    corrected_ticker TEXT,
    strike NUMERIC,
    barrier_abs NUMERIC,
    UNIQUE(isin, original_ticker)
);

CREATE INDEX IF NOT EXISTS idx_underlyings_isin ON public.underlyings(isin);

-- ============================================================================
-- 2. Row Level Security
-- Il backend usa la SERVICE_ROLE_KEY (bypassa RLS). Abilitiamo RLS senza
-- policy permissive: default-deny per anon/authenticated via PostgREST,
-- coerente con 20260202090000_secure_rls.sql.
-- ============================================================================

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.underlyings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. Grants (Supabase non espone più le tabelle automaticamente)
-- Vedi 20260527152000_grant_api_access.sql.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.certificates TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.underlyings TO authenticated, service_role;

-- Sequenza per underlyings.id (BIGSERIAL)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
