-- Security Advisor warning hardening
-- Targets:
--   - function_search_path_mutable
--   - rls_policy_always_true
--   - public_bucket_allows_listing

begin;
-- ---------------------------------------------------------------------------
-- 1) Function Search Path Mutable
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.cleanup_old_api_usage_logs()',
    'public.cleanup_old_rate_limits()',
    'public.update_profile_on_recipe_change()',
    'public.update_updated_at_column()',
    'public.is_admin()',
    'public.admin_clear_all_user_trash()',
    'public.admin_clear_all_non_admin_ingredient_master()',
    'public.admin_clear_target_user_ingredient_master(uuid)'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
    END IF;
  END LOOP;
END
$$;
-- ---------------------------------------------------------------------------
-- 2) RLS Policy Always True
-- ---------------------------------------------------------------------------

-- deleted_recipes
DROP POLICY IF EXISTS deleted_recipes_select_authenticated ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_insert_authenticated ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_update_authenticated ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_delete_authenticated ON public.deleted_recipes;
CREATE POLICY deleted_recipes_select_authenticated
  ON public.deleted_recipes
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY deleted_recipes_insert_authenticated
  ON public.deleted_recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY deleted_recipes_update_authenticated
  ON public.deleted_recipes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY deleted_recipes_delete_authenticated
  ON public.deleted_recipes
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);
-- material_costs
DROP POLICY IF EXISTS "Allow anonymous read access" ON public.material_costs;
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.material_costs;
DROP POLICY IF EXISTS "Allow anonymous update" ON public.material_costs;
DROP POLICY IF EXISTS "Allow anonymous delete" ON public.material_costs;
CREATE POLICY material_costs_select_authenticated
  ON public.material_costs
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY material_costs_insert_authenticated
  ON public.material_costs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY material_costs_update_authenticated
  ON public.material_costs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY material_costs_delete_authenticated
  ON public.material_costs
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);
-- recent_views
DROP POLICY IF EXISTS "Enable access to all users" ON public.recent_views;
DROP POLICY IF EXISTS recent_views_authenticated_access ON public.recent_views;
CREATE POLICY recent_views_authenticated_access
  ON public.recent_views
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
-- recipe_sources
DROP POLICY IF EXISTS "Enable all access for anon" ON public.recipe_sources;
DROP POLICY IF EXISTS "Enable all access for authenticated" ON public.recipe_sources;
DROP POLICY IF EXISTS recipe_sources_authenticated_access ON public.recipe_sources;
CREATE POLICY recipe_sources_authenticated_access
  ON public.recipe_sources
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
-- recipes
DROP POLICY IF EXISTS "recipes_select_all" ON public.recipes;
DROP POLICY IF EXISTS "recipes_insert_authenticated" ON public.recipes;
DROP POLICY IF EXISTS "recipes_update_authenticated" ON public.recipes;
DROP POLICY IF EXISTS "recipes_delete_authenticated" ON public.recipes;
CREATE POLICY "recipes_select_all"
  ON public.recipes
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "recipes_insert_authenticated"
  ON public.recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND char_length(title) <= 200
    AND char_length(coalesce(description, '')) <= 1000
    AND jsonb_array_length(coalesce(ingredients, '[]'::jsonb)) <= 200
  );
CREATE POLICY "recipes_update_authenticated"
  ON public.recipes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND char_length(title) <= 200
    AND char_length(coalesce(description, '')) <= 1000
    AND jsonb_array_length(coalesce(ingredients, '[]'::jsonb)) <= 200
  );
CREATE POLICY "recipes_delete_authenticated"
  ON public.recipes
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);
-- ---------------------------------------------------------------------------
-- 3) Public Bucket Allows Listing
-- ---------------------------------------------------------------------------
-- Remove broad public SELECT policies and replace with non-broad policies.

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Access App Data" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to app-data" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read recipe-images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read files in app-data" ON storage.objects;
CREATE POLICY "Authenticated read recipe-images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'recipe-images'
    AND auth.uid() IS NOT NULL
  );
CREATE POLICY "Admins can read files in app-data"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'app-data'
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
commit;
