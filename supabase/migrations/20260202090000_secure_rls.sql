-- Secure Database Tables by Enabling RLS and Cleaning Policies

-- 1. Enable RLS on tables where it was missing
ALTER TABLE IF EXISTS public.asset_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dividends ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.asset_metrics_history ENABLE ROW LEVEL SECURITY;

-- 2. Secure app_config: It was wide open to public
-- Check if policies exist before dropping to avoid errors, or just use DROP POLICY IF EXISTS
DROP POLICY IF EXISTS "Enable read access for all users" ON public.app_config;
DROP POLICY IF EXISTS "Enable insert/update for all users" ON public.app_config;

-- 3. Review logic: 
-- The application uses a Python Backend with Service Role Key for data access.
-- Therefore, we do NOT need permissive policies for 'anon' or 'authenticated' roles on data tables.
-- The Service Role bypasses RLS, so it will continue to work.
-- Regular users (authenticated via Supabase Auth) should NOT be able to access tables directly via PostgREST.

-- We should ensure NO policies exist that allow public/authenticated access to sensitive tables 
-- unless specifically required.
-- Unlike the initial schema which added policies ("Users can view own transactions"), 
-- we will leave them for now IF they are correctly scoped to "own data".
-- However, existing policies on 'assets' ("Authenticated users can view assets") are fine for read-only master data.

-- CRITICAL FIX: The missing RLS on asset_prices, dividends, etc. allowed FULL ACCESS.
-- By enabling it above, and NOT adding any policies, default deny applies.
-- This effectively blocks client-side access to these tables, which is desired.

-- For completeness, verify essential tables have RLS (idempotent-ish in intent)
ALTER TABLE IF EXISTS public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Create a specific policy for app_config if needed (e.g. read-only for auth users?)
-- If the backend handles config, no policy needed. 
-- If frontend needs to read config (e.g. feature flags), add a read-only policy.
-- Checking usage: api/index.py reads it. No evidence of frontend direct read. 
-- So Default Deny is safe.
