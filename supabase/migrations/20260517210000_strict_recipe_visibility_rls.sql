-- レシピ閲覧を厳密化: 本人・public タグ・管理者のみ SELECT 可能にする

BEGIN;

-- 管理者判定（SECURITY DEFINER で profiles RLS を迂回）
CREATE OR REPLACE FUNCTION public.is_admin_safe()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_safe() TO service_role;

-- タグ配列に対する閲覧可否（recipes / recipe_sources 共通）
CREATE OR REPLACE FUNCTION public.can_read_recipe_tags(recipe_tags text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_safe()
    OR (
      recipe_tags IS NOT NULL
      AND (
        'public' = ANY (recipe_tags)
        OR recipe_tags @> ARRAY['owner:' || auth.uid()::text]
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.display_id IS NOT NULL
            AND recipe_tags @> ARRAY['owner:' || p.display_id]
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_read_recipe_tags(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_recipe_tags(text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipes_select_all" ON public.recipes;
DROP POLICY IF EXISTS "recipes_select_policy_v2" ON public.recipes;
DROP POLICY IF EXISTS "recipes_select_policy_v3" ON public.recipes;
DROP POLICY IF EXISTS "recipes_select_policy_final" ON public.recipes;
DROP POLICY IF EXISTS "Public read access for recipes" ON public.recipes;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.recipes;

CREATE POLICY recipes_select_own_public_or_admin
  ON public.recipes
  FOR SELECT
  TO authenticated
  USING (public.can_read_recipe_tags(tags));

DROP POLICY IF EXISTS "recipes_insert_authenticated" ON public.recipes;

CREATE POLICY recipes_insert_own_or_admin
  ON public.recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.is_admin_safe()
      OR tags @> ARRAY['owner:' || auth.uid()::text]
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.display_id IS NOT NULL
          AND tags @> ARRAY['owner:' || p.display_id]
      )
    )
    AND char_length(title) <= 200
    AND char_length(coalesce(description, '')) <= 1000
    AND jsonb_array_length(coalesce(ingredients, '[]'::jsonb)) <= 200
  );

-- 緩い UPDATE/DELETE を除去（複数 PERMISSIVE は OR になるため）
DROP POLICY IF EXISTS "recipes_update_authenticated" ON public.recipes;
DROP POLICY IF EXISTS "recipes_delete_authenticated" ON public.recipes;
DROP POLICY IF EXISTS "recipes_update_own_or_admin" ON public.recipes;
DROP POLICY IF EXISTS "recipes_delete_own_or_admin" ON public.recipes;

CREATE POLICY recipes_update_own_or_admin
  ON public.recipes
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_safe()
    OR tags @> ARRAY['owner:' || auth.uid()::text]
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.display_id IS NOT NULL
        AND tags @> ARRAY['owner:' || p.display_id]
    )
  )
  WITH CHECK (
    char_length(title) <= 200
    AND char_length(coalesce(description, '')) <= 1000
    AND jsonb_array_length(coalesce(ingredients, '[]'::jsonb)) <= 200
  );

CREATE POLICY recipes_delete_own_or_admin
  ON public.recipes
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_safe()
    OR tags @> ARRAY['owner:' || auth.uid()::text]
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.display_id IS NOT NULL
        AND tags @> ARRAY['owner:' || p.display_id]
    )
  );

-- ---------------------------------------------------------------------------
-- recipe_sources（親レシピと同じ閲覧範囲）
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipe_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for anon" ON public.recipe_sources;
DROP POLICY IF EXISTS "Enable all access for authenticated" ON public.recipe_sources;
DROP POLICY IF EXISTS recipe_sources_authenticated_access ON public.recipe_sources;

CREATE POLICY recipe_sources_select_visible_recipe
  ON public.recipe_sources
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recipes r
      WHERE r.id = recipe_sources.recipe_id
        AND public.can_read_recipe_tags(r.tags)
    )
  );

CREATE POLICY recipe_sources_insert_own_or_admin
  ON public.recipe_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.recipes r
      WHERE r.id = recipe_sources.recipe_id
        AND (
          public.is_admin_safe()
          OR r.tags @> ARRAY['owner:' || auth.uid()::text]
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.display_id IS NOT NULL
              AND r.tags @> ARRAY['owner:' || p.display_id]
          )
        )
    )
  );

CREATE POLICY recipe_sources_update_own_or_admin
  ON public.recipe_sources
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recipes r
      WHERE r.id = recipe_sources.recipe_id
        AND (
          public.is_admin_safe()
          OR r.tags @> ARRAY['owner:' || auth.uid()::text]
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.display_id IS NOT NULL
              AND r.tags @> ARRAY['owner:' || p.display_id]
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.recipes r
      WHERE r.id = recipe_sources.recipe_id
        AND (
          public.is_admin_safe()
          OR r.tags @> ARRAY['owner:' || auth.uid()::text]
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.display_id IS NOT NULL
              AND r.tags @> ARRAY['owner:' || p.display_id]
          )
        )
    )
  );

CREATE POLICY recipe_sources_delete_own_or_admin
  ON public.recipe_sources
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recipes r
      WHERE r.id = recipe_sources.recipe_id
        AND (
          public.is_admin_safe()
          OR r.tags @> ARRAY['owner:' || auth.uid()::text]
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.display_id IS NOT NULL
              AND r.tags @> ARRAY['owner:' || p.display_id]
          )
        )
    )
  );

COMMIT;
