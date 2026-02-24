-- admin_list_all_backups RPC の id 曖昧参照エラーを修正
-- 全カラムをテーブルエイリアスで修飾する

CREATE OR REPLACE FUNCTION public.admin_list_all_backups()
RETURNS TABLE (
  id           uuid,
  user_id      uuid,
  display_id   text,
  email        text,
  generation   smallint,
  recipe_count integer,
  label        text,
  created_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 管理者チェック
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  RETURN QUERY
  SELECT
    ab.id          AS id,
    ab.user_id     AS user_id,
    p.display_id   AS display_id,
    p.email        AS email,
    ab.generation  AS generation,
    ab.recipe_count AS recipe_count,
    ab.label       AS label,
    ab.created_at  AS created_at
  FROM public.account_backups ab
  LEFT JOIN public.profiles p ON p.id = ab.user_id
  ORDER BY p.display_id, ab.generation;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_all_backups() TO authenticated;
