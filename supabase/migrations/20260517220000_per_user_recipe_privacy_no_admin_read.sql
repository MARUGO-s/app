-- 管理者を含め、他ユーザーのレシピは閲覧・変更不可（本人 + public のみ）

BEGIN;

-- 本人所有かどうか（閲覧可否の owner 部分）
CREATE OR REPLACE FUNCTION public.owns_recipe_tags(recipe_tags text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    recipe_tags IS NOT NULL
    AND (
      recipe_tags @> ARRAY['owner:' || auth.uid()::text]
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.display_id IS NOT NULL
          AND recipe_tags @> ARRAY['owner:' || p.display_id]
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.owns_recipe_tags(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_recipe_tags(text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.can_read_recipe_tags(recipe_tags text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.owns_recipe_tags(recipe_tags)
    OR (
      recipe_tags IS NOT NULL
      AND 'public' = ANY (recipe_tags)
    );
$$;

-- ---------------------------------------------------------------------------
-- recipes: INSERT / UPDATE / DELETE から管理者バイパスを除去
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS recipes_insert_own_or_admin ON public.recipes;

CREATE POLICY recipes_insert_own_or_admin
  ON public.recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.owns_recipe_tags(tags)
    AND char_length(title) <= 200
    AND char_length(coalesce(description, '')) <= 1000
    AND jsonb_array_length(coalesce(ingredients, '[]'::jsonb)) <= 200
  );

DROP POLICY IF EXISTS recipes_update_own_or_admin ON public.recipes;

CREATE POLICY recipes_update_own_or_admin
  ON public.recipes
  FOR UPDATE
  TO authenticated
  USING (public.owns_recipe_tags(tags))
  WITH CHECK (
    public.owns_recipe_tags(tags)
    AND char_length(title) <= 200
    AND char_length(coalesce(description, '')) <= 1000
    AND jsonb_array_length(coalesce(ingredients, '[]'::jsonb)) <= 200
  );

DROP POLICY IF EXISTS recipes_delete_own_or_admin ON public.recipes;

CREATE POLICY recipes_delete_own_or_admin
  ON public.recipes
  FOR DELETE
  TO authenticated
  USING (public.owns_recipe_tags(tags));

-- ---------------------------------------------------------------------------
-- recipe_sources: 親レシピの所有権に連動（管理者バイパスなし）
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS recipe_sources_insert_own_or_admin ON public.recipe_sources;
DROP POLICY IF EXISTS recipe_sources_update_own_or_admin ON public.recipe_sources;
DROP POLICY IF EXISTS recipe_sources_delete_own_or_admin ON public.recipe_sources;

CREATE POLICY recipe_sources_insert_own_or_admin
  ON public.recipe_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.recipes r
      WHERE r.id = recipe_sources.recipe_id
        AND public.owns_recipe_tags(r.tags)
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
        AND public.owns_recipe_tags(r.tags)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.recipes r
      WHERE r.id = recipe_sources.recipe_id
        AND public.owns_recipe_tags(r.tags)
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
        AND public.owns_recipe_tags(r.tags)
    )
  );

-- ---------------------------------------------------------------------------
-- deleted_recipes: ゴミ箱も本人分のみ（管理者は他ユーザーの削除履歴を見られない）
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS deleted_recipes_select_own_or_admin ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_insert_own_or_admin ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_update_own_or_admin ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_delete_own_or_admin ON public.deleted_recipes;

CREATE POLICY deleted_recipes_select_own_or_admin
  ON public.deleted_recipes
  FOR SELECT
  TO authenticated
  USING (
    deleted_by_user_id = (SELECT auth.uid())
    OR public.owns_recipe_tags(coalesce(tags, '{}'::text[]))
  );

CREATE POLICY deleted_recipes_insert_own_or_admin
  ON public.deleted_recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    deleted_by_user_id = (SELECT auth.uid())
    OR public.owns_recipe_tags(coalesce(tags, '{}'::text[]))
  );

CREATE POLICY deleted_recipes_update_own_or_admin
  ON public.deleted_recipes
  FOR UPDATE
  TO authenticated
  USING (
    deleted_by_user_id = (SELECT auth.uid())
    OR public.owns_recipe_tags(coalesce(tags, '{}'::text[]))
  )
  WITH CHECK (
    deleted_by_user_id = (SELECT auth.uid())
    OR public.owns_recipe_tags(coalesce(tags, '{}'::text[]))
  );

CREATE POLICY deleted_recipes_delete_own_or_admin
  ON public.deleted_recipes
  FOR DELETE
  TO authenticated
  USING (
    deleted_by_user_id = (SELECT auth.uid())
    OR public.owns_recipe_tags(coalesce(tags, '{}'::text[]))
  );

COMMIT;
