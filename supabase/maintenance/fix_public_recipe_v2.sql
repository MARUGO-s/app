-- fix_public_recipe_v2.sql

-- 1. Fix Permissions: Ensure 'authenticated' users can run the admin check function
-- (Without this, the policy might error out, causing empty results)
GRANT EXECUTE ON FUNCTION public.is_admin_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_safe TO service_role;

-- 2. Re-create the policy with safer NULL handling and simpler logic
DROP POLICY IF EXISTS "recipes_select_policy_v2" ON public.recipes;

CREATE POLICY "recipes_select_policy_v3" ON public.recipes
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
  -- A. Admin Access
  is_admin_safe()
  OR
  -- B. General Access (Check tags safely)
  (
    tags IS NOT NULL 
    AND (
       -- 1. Public tag
       'public' = ANY(tags)
       OR
       -- 2. Owner tag
       ('owner:' || auth.uid()::text) = ANY(tags)
    )
  )
);
