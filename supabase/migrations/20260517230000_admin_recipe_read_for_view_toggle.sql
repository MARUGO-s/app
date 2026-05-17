-- 管理者は DB 上で全レシピを SELECT 可能（アプリの「他ユーザー表示」トグル OFF 時はクライアントで非表示）
-- 変更・削除は引き続き本人分のみ

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
    );
$$;

COMMIT;
