-- マスターレシピ共有(show_master_recipes)がONの一般ユーザーに、
-- 管理者所有レシピのSELECTを許可する。
-- 20260517230000 で can_read_recipe_tags() が admin/自分/publicタグのみに絞られ、
-- show_master_recipes を考慮する分岐が無かったため、
-- ユーザー管理画面で「マスター表示」をONにしてもマスターレシピが一覧に出ない不具合があった。

BEGIN;

CREATE OR REPLACE FUNCTION public.can_read_recipe_tags(recipe_tags text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_safe()
    OR public.owns_recipe_tags(recipe_tags)
    OR (
      recipe_tags IS NOT NULL
      AND 'public' = ANY (recipe_tags)
    )
    OR (
      recipe_tags IS NOT NULL
      AND recipe_tags && public.get_master_recipe_owner_tags()
      AND EXISTS (
        SELECT 1
        FROM public.profiles me
        WHERE me.id = auth.uid()
          AND me.show_master_recipes = true
      )
    );
$$;

COMMIT;
