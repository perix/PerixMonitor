-- Fix Production Permissions: Profiles Visibility and App Config Updates

-- 1. PROFILES: Allow authenticated users to view all profiles 
-- (Required for "User List" to show other users, if that's the intended behavior)
-- Current policy "Users can view own profile" hides everyone else.
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Create new policy (or replace)
CREATE POLICY "Authenticated users can view all profiles" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (true);

-- 2. APP_CONFIG: Allow authenticated users to update settings (like Logging)
-- Previous migration removed this capability, causing errors in UI.
DROP POLICY IF EXISTS "Authenticated users can update app_config" ON public.app_config;
DROP POLICY IF EXISTS "Authenticated users can insert app_config" ON public.app_config;

-- Allow Update
CREATE POLICY "Authenticated users can update app_config" 
ON public.app_config FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Allow Insert (if config key missing)
CREATE POLICY "Authenticated users can insert app_config" 
ON public.app_config FOR INSERT 
TO authenticated 
WITH CHECK (true);
