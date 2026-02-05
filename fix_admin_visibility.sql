-- fix_admin_visibility.sql

-- 1. Create a safe function to check admin status
-- SECURITY DEFINER allows this function to bypass RLS, preventing infinite recursion
CREATE OR REPLACE FUNCTION public.is_admin_safe()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- 2. Update the SELECT policy to allow Admins to see ALL profiles
-- Drop the restrictive safeguard policy we just made
DROP POLICY IF EXISTS profiles_select_own_safeguard ON public.profiles;

-- Create a new inclusive policy
CREATE POLICY profiles_select_own_or_admin_safe ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id  -- Can see own profile
    OR
    is_admin_safe()  -- OR if you are an admin (checked safely)
  );

-- 3. Update the UPDATE policy as well (Admins usually need to edit users too)
DROP POLICY IF EXISTS profiles_update_own_safeguard ON public.profiles;

CREATE POLICY profiles_update_own_or_admin_safe ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR
    is_admin_safe()
  );
