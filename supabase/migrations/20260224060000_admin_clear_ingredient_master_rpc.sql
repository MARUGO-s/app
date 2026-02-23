-- 管理者専用: 全通常ユーザーの材料マスター（unit_conversions + csv_unit_overrides）を一括削除するRPC

CREATE OR REPLACE FUNCTION admin_clear_all_non_admin_ingredient_master()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_unit_conversions integer;
  deleted_csv_overrides integer;
BEGIN
  -- 管理者チェック
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- 通常ユーザー（adminロール以外）のunit_conversionsを全削除
  DELETE FROM public.unit_conversions
  WHERE user_id IN (
    SELECT id FROM public.profiles WHERE role != 'admin' OR role IS NULL
  );
  GET DIAGNOSTICS deleted_unit_conversions = ROW_COUNT;

  -- 通常ユーザー（adminロール以外）のcsv_unit_overridesを全削除
  DELETE FROM public.csv_unit_overrides
  WHERE user_id IN (
    SELECT id FROM public.profiles WHERE role != 'admin' OR role IS NULL
  );
  GET DIAGNOSTICS deleted_csv_overrides = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_unit_conversions', deleted_unit_conversions,
    'deleted_csv_overrides', deleted_csv_overrides
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_clear_all_non_admin_ingredient_master() TO authenticated;
