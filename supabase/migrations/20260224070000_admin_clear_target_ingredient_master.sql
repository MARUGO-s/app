-- 管理者専用: 指定したユーザーの材料マスター（unit_conversions + csv_unit_overrides）を一括削除するRPC

CREATE OR REPLACE FUNCTION admin_clear_target_user_ingredient_master(target_user_id UUID)
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

  -- 自身（admin）のデータを誤って削除しないための安全策
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own master data with this function.';
  END IF;

  -- 指定されたユーザーのunit_conversionsを全削除
  DELETE FROM public.unit_conversions
  WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_unit_conversions = ROW_COUNT;

  -- 指定されたユーザーのcsv_unit_overridesを全削除
  DELETE FROM public.csv_unit_overrides
  WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_csv_overrides = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_unit_conversions', deleted_unit_conversions,
    'deleted_csv_overrides', deleted_csv_overrides,
    'target_user_id', target_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_clear_target_user_ingredient_master(UUID) TO authenticated;
