-- admin_copy_master_to_all_users
-- 管理者（admin_id）の unit_conversions と csv_unit_overrides を、
-- 'admin' 以外の全てのプロフィール（通常ユーザー）にコピー（UPSERT）する関数

CREATE OR REPLACE FUNCTION admin_copy_master_to_all_users(p_admin_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- 1. admin 権限を持たない全てのユーザーをループ
    FOR v_user_id IN
        SELECT id FROM profiles WHERE role IS DISTINCT FROM 'admin'
    LOOP
        -- 2. unit_conversions のコピー（同じ item_name があれば上書き）
        INSERT INTO unit_conversions (user_id, item_name, unit, amount, display_unit, created_at, updated_at)
        SELECT 
            v_user_id,
            item_name,
            unit,
            amount,
            display_unit,
            now(),
            now()
        FROM unit_conversions
        WHERE user_id = p_admin_id
        ON CONFLICT (user_id, item_name)
        DO UPDATE SET
            unit = EXCLUDED.unit,
            amount = EXCLUDED.amount,
            display_unit = EXCLUDED.display_unit,
            updated_at = now();

        -- 3. csv_unit_overrides のコピー（同じ item_name, original_unit があれば上書き）
        INSERT INTO csv_unit_overrides (user_id, item_name, original_unit, override_unit, multiplier, created_at, updated_at)
        SELECT
            v_user_id,
            item_name,
            original_unit,
            override_unit,
            multiplier,
            now(),
            now()
        FROM csv_unit_overrides
        WHERE user_id = p_admin_id
        ON CONFLICT (user_id, item_name, original_unit)
        DO UPDATE SET
            override_unit = EXCLUDED.override_unit,
            multiplier = EXCLUDED.multiplier,
            updated_at = now();
    END LOOP;
END;
$$;
