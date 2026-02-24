-- admin_list_all_backups を DROP してから再作成
-- RETURNS TABLE のカラム名 'id' が PL/pgSQL 内部変数と衝突するため 'backup_id' に変更

DROP FUNCTION IF EXISTS public.admin_list_all_backups();

CREATE FUNCTION public.admin_list_all_backups()
RETURNS TABLE (
  backup_id    uuid,
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
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND pr.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  RETURN QUERY
  SELECT
    ab.id          AS backup_id,
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
