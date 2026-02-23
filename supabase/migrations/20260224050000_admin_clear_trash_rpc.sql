-- 管理者専用: 全通常ユーザーのゴミ箱データを一括削除するRPC関数

CREATE OR REPLACE FUNCTION admin_clear_all_user_trash()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_price_csvs integer;
  deleted_ingredients integer;
BEGIN
  -- 管理者チェック
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- 通常ユーザー（adminロール以外）のゴミ箱を全削除
  DELETE FROM public.trash_price_csvs
  WHERE user_id IN (
    SELECT id FROM public.profiles WHERE role != 'admin' OR role IS NULL
  );
  GET DIAGNOSTICS deleted_price_csvs = ROW_COUNT;

  DELETE FROM public.trash_ingredient_master
  WHERE user_id IN (
    SELECT id FROM public.profiles WHERE role != 'admin' OR role IS NULL
  );
  GET DIAGNOSTICS deleted_ingredients = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_price_csvs', deleted_price_csvs,
    'deleted_ingredients', deleted_ingredients
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_clear_all_user_trash() TO authenticated;
