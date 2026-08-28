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
        -- 2. unit_conversions のコピー（同じ ingredient_name があれば上書き）
        INSERT INTO unit_conversions (
            user_id, 
            ingredient_name, 
            packet_unit, 
            packet_size, 
            last_price, 
            item_category, 
            vendor, 
            yield_percent, 
            updated_at
        )
        SELECT 
            v_user_id::text,
            ingredient_name,
            packet_unit,
            packet_size,
            last_price,
            item_category,
            vendor,
            yield_percent,
            now()
        FROM unit_conversions
        WHERE user_id = p_admin_id::text
        ON CONFLICT (user_id, ingredient_name)
        DO UPDATE SET
            packet_unit = EXCLUDED.packet_unit,
            packet_size = EXCLUDED.packet_size,
            last_price = EXCLUDED.last_price,
            item_category = EXCLUDED.item_category,
            vendor = EXCLUDED.vendor,
            yield_percent = EXCLUDED.yield_percent,
            updated_at = now();

        -- 3. csv_unit_overrides のコピー（同じ ingredient_name があれば csv_unit のみ上書き）
        INSERT INTO csv_unit_overrides (user_id, ingredient_name, csv_unit, updated_at)
        SELECT
            v_user_id::text,
            ingredient_name,
            csv_unit,
            now()
        FROM csv_unit_overrides
        WHERE user_id = p_admin_id::text
        ON CONFLICT (user_id, ingredient_name)
        DO UPDATE SET
            csv_unit = EXCLUDED.csv_unit,
            updated_at = now();
    END LOOP;
END;
$$;
