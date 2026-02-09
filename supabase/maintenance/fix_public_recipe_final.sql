-- fix_public_recipe_final.sql

-- 1. Create the helper function explicitly (SECURITY DEFINER to bypass RLS recursion)
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

-- 2. Grant Execute Permissions (Critical for general users)
GRANT EXECUTE ON FUNCTION public.is_admin_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_safe TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_safe TO anon;

-- 3. Re-Apply the RLS Policy using this function
DROP POLICY IF EXISTS "recipes_select_policy_v2" ON public.recipes;
DROP POLICY IF EXISTS "recipes_select_policy_v3" ON public.recipes;

CREATE POLICY "recipes_select_policy_final" ON public.recipes
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
  -- A. Admin check (now guaranteed to exist and be accessible)
  is_admin_safe()
  OR
  -- B. General User check
  (
    tags IS NOT NULL 
    AND (
       'public' = ANY(tags)
       OR
       ('owner:' || auth.uid()::text) = ANY(tags)
    )
  )
);
