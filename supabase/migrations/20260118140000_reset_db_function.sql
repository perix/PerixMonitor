-- Create a function to reset domain data securely from the client
-- This function runs with SECURITY DEFINER privileges to bypass RLS for TRUNCATE operations
-- It is restricted to authenticated users (and ideally should be admin-only in production)

CREATE OR REPLACE FUNCTION public.reset_db_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is authenticated (redundant if granted only to authenticated, but good practice)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Perform the truncation
  -- We use the same logic as the manual script: clear domain data, keep users/config
  TRUNCATE TABLE 
      public.dividends,
      public.asset_metrics_history,
      public.snapshots,
      public.transactions,
      public.asset_prices,
      public.portfolios,
      public.assets
  RESTART IDENTITY CASCADE;

END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.reset_db_data() TO authenticated;
