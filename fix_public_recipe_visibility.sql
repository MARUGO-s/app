-- fix_public_recipe_visibility.sql

-- RLS Policy Update for 'recipes' table
-- Goal: Ensure users can see:
-- 1. Their own recipes (tag 'owner:<uid>')
-- 2. Public recipes (tag 'public')
-- 3. ALL recipes if they are Admin

-- 1. Enable RLS (just in case)
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- 2. Drop potential existing restrictive policies to avoid conflicts
-- (Attempting to drop common names, ignoring errors if not exists)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.recipes;
DROP POLICY IF EXISTS "Enable read access for own recipes" ON public.recipes;
DROP POLICY IF EXISTS "recipes_select_policy" ON public.recipes;
DROP POLICY IF EXISTS "recipes_read_own" ON public.recipes;

-- 3. Create comprehensive SELECT policy
CREATE POLICY "recipes_select_policy_v2" ON public.recipes
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
  -- 1. Own recipes
  ('owner:' || auth.uid()::text) = ANY (tags)
  OR
  -- 2. Public recipes
  'public' = ANY (tags)
  OR
  -- 3. Admin access (using safe function)
  is_admin_safe()
);

-- 4. Ensure INSERT/UPDATE/DELETE policies exist for Owner
-- (Assuming they might be missing or restrictive too)

-- INSERT: User can insert if they tag themselves as owner?
-- Usually INSERT check is "WITH CHECK".
-- For now, let's assume INSERT/UPDATE were working for "Own" data, 
-- but we should reinforce them to be safe.

DROP POLICY IF EXISTS "recipes_insert_policy" ON public.recipes;
CREATE POLICY "recipes_insert_policy" ON public.recipes
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (
  ('owner:' || auth.uid()::text) = ANY (tags)
  OR is_admin_safe()
);

DROP POLICY IF EXISTS "recipes_update_policy" ON public.recipes;
CREATE POLICY "recipes_update_policy" ON public.recipes
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (
  ('owner:' || auth.uid()::text) = ANY (tags)
  OR is_admin_safe()
);

DROP POLICY IF EXISTS "recipes_delete_policy" ON public.recipes;
CREATE POLICY "recipes_delete_policy" ON public.recipes
AS PERMISSIVE FOR DELETE
TO authenticated
USING (
  ('owner:' || auth.uid()::text) = ANY (tags)
  OR is_admin_safe()
);
