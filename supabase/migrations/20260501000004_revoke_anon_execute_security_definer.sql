-- SECURITY DEFINER 関数の anon ロールによる実行を禁止
-- デフォルトで PUBLIC（anon 含む）に EXECUTE が付与されているため、
-- 明示的に anon から REVOKE し、必要なロールにのみ GRANT する

BEGIN;

-- ----------------------------------------------------------------
-- 管理者専用関数（authenticated から呼び出し、内部でロールチェック）
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_clear_all_non_admin_ingredient_master()                              FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_clear_all_user_trash()                                               FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_clear_target_user_ingredient_master(uuid)                            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_copy_ingredient_master(uuid, boolean)                                FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_copy_master_to_all_users(uuid)                                      FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid)                                                    FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_login_logs(uuid)                                                 FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_login_logs_test(uuid)                                            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_all_backups()                                                   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_profiles()                                                      FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_profiles_test()                                                 FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_save_backup(uuid, jsonb, integer, text)                              FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_feature_flag(text, boolean)                                      FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_profile_store_name(uuid, text)                                   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, text)                                                 FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_show_master_recipes(uuid, boolean)                               FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_clear_all_non_admin_ingredient_master()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_all_user_trash()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_target_user_ingredient_master(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_copy_ingredient_master(uuid, boolean)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_copy_master_to_all_users(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid)                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_login_logs(uuid)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_login_logs_test(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_all_backups()                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles()                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles_test()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_backup(uuid, jsonb, integer, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_flag(text, boolean)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_store_name(uuid, text)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, text)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_show_master_recipes(uuid, boolean)        TO authenticated;

-- ----------------------------------------------------------------
-- 監査ログ書き込み
-- 4引数版は service_role 専用。3引数版は管理者本人の auth.uid() で記録する。
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_write_audit_log(uuid, text, text, jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_write_audit_log(uuid, text, text, jsonb) TO service_role;

-- ブラウザ側の管理者操作は、管理者専用RPC成功後にこの3引数版を呼ぶ。
-- 呼び出し元から admin_id を受け取らず、必ず auth.uid() で記録する。
CREATE OR REPLACE FUNCTION public.admin_write_audit_log(
    p_action    TEXT,
    p_target_id TEXT DEFAULT NULL,
    p_detail    JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
BEGIN
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = v_admin_id
          AND p.role = 'admin'
    ) THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;

    INSERT INTO public.admin_audit_logs (admin_id, action, target_id, detail)
    VALUES (v_admin_id, p_action, p_target_id, p_detail);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_write_audit_log(text, text, jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_write_audit_log(text, text, jsonb) TO authenticated;

-- ----------------------------------------------------------------
-- レートリミット（Edge Function の service_role から呼び出し）
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, text, integer, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, text, integer, integer) TO service_role;

-- ----------------------------------------------------------------
-- 一般ユーザーが使う関数（authenticated のみ）
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_feature_flag(text)          FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_master_recipe_owner_tags()  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_recipe_counts()        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin()                      FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_user_active_presence()      FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_user_login()                    FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_operation_qa_log(uuid, smallint) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_ingredients(text, integer)    FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_feature_flag(text)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_master_recipe_owner_tags()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_recipe_counts()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_user_active_presence()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_user_login()                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.rate_operation_qa_log(uuid, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_ingredients(text, integer)     TO authenticated;

-- ----------------------------------------------------------------
-- トリガー関数（DB 内部から呼び出し。ユーザーから直接呼び出し不可）
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_profile_on_recipe_change()  FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.handle_new_user()                 TO service_role;
GRANT EXECUTE ON FUNCTION public.update_profile_on_recipe_change() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
