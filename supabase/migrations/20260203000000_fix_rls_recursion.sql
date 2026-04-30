-- Fix infinite recursion in profiles table RLS policies
-- The previous policy 'profiles_select_own_or_admin' called is_admin(), which queried profiles, creating a loop.

-- 1. Drop the problematic recursive policies
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own_or_admin ON public.profiles;
-- 2. Create simplified policies that strictly check ID match
-- This guarantees that a user can ALWAYS read/update their own profile without external function dependency.

CREATE POLICY profiles_select_own_safeguard ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY profiles_update_own_safeguard ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);
-- Note: Admin access to *other* profiles is temporarily disabled with this simplified policy 
-- to ensure stability for regular users. If admin access is needed, 
-- we must refactor is_admin() to not query the table it protects, or use app_metadata.;
