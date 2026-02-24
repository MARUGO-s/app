-- account_backups: 各ユーザーのレシピバックアップを最大3世代保存するテーブル

CREATE TABLE IF NOT EXISTS public.account_backups (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation   smallint    NOT NULL CHECK (generation BETWEEN 1 AND 3),
  backup_data  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  recipe_count integer     NOT NULL DEFAULT 0,
  label        text        NOT NULL DEFAULT '自動バックアップ',
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- ユーザーごとに generation は一意（UPSERT で上書きするため）
  UNIQUE (user_id, generation)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_account_backups_user_id ON public.account_backups (user_id);
CREATE INDEX IF NOT EXISTS idx_account_backups_created_at ON public.account_backups (created_at DESC);

-- RLS 有効化
ALTER TABLE public.account_backups ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のバックアップを参照可能
DROP POLICY IF EXISTS "Users can read own backups" ON public.account_backups;
CREATE POLICY "Users can read own backups"
  ON public.account_backups FOR SELECT
  USING (auth.uid() = user_id);

-- 管理者は全件参照可能（profiles テーブルで role = 'admin' チェック）
DROP POLICY IF EXISTS "Admins can read all backups" ON public.account_backups;
CREATE POLICY "Admins can read all backups"
  ON public.account_backups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- サービスロール（Edge Function）は全件INSERT/UPDATE可能
DROP POLICY IF EXISTS "Service role can upsert backups" ON public.account_backups;
CREATE POLICY "Service role can upsert backups"
  ON public.account_backups FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 管理者もINSERT/UPDATE可能（手動バックアップ用）
DROP POLICY IF EXISTS "Admins can upsert backups" ON public.account_backups;
CREATE POLICY "Admins can upsert backups"
  ON public.account_backups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- RPC: admin_list_all_backups
-- 全ユーザーのバックアップ一覧を管理者向けに返す
-- ============================================================
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
    ab.id,
    ab.user_id,
    p.display_id,
    p.email,
    ab.generation,
    ab.recipe_count,
    ab.label,
    ab.created_at
  FROM public.account_backups ab
  LEFT JOIN public.profiles p ON p.id = ab.user_id
  ORDER BY p.display_id, ab.generation;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_all_backups() TO authenticated;

-- ============================================================
-- RPC: admin_trigger_backup_for_user
-- 特定ユーザーのレシピを backup_data として受け取り保存する
-- (フロントエンド側でデータを取得して渡す方式)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_save_backup(
  p_user_id    uuid,
  p_backup_data jsonb,
  p_recipe_count integer,
  p_label      text DEFAULT '手動バックアップ'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_generation smallint;
  v_max_gen smallint;
BEGIN
  -- 管理者チェック（または service_role）
  IF auth.role() <> 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- 現在の最大世代番号を取得
  SELECT COALESCE(MAX(generation), 0) INTO v_max_gen
  FROM public.account_backups
  WHERE user_id = p_user_id;

  -- 次の世代番号を計算（1→2→3→1 のサイクル）
  IF v_max_gen = 0 THEN
    v_next_generation := 1;
  ELSE
    -- 既存レコード数が 3 未満なら次の番号、3以上なら最も古い generation を上書き
    IF (SELECT COUNT(*) FROM public.account_backups WHERE user_id = p_user_id) < 3 THEN
      v_next_generation := v_max_gen + 1;
    ELSE
      -- 最も古い created_at の世代を上書き
      SELECT generation INTO v_next_generation
      FROM public.account_backups
      WHERE user_id = p_user_id
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  -- UPSERT
  INSERT INTO public.account_backups (user_id, generation, backup_data, recipe_count, label, created_at)
  VALUES (p_user_id, v_next_generation, p_backup_data, p_recipe_count, p_label, now())
  ON CONFLICT (user_id, generation)
  DO UPDATE SET
    backup_data  = EXCLUDED.backup_data,
    recipe_count = EXCLUDED.recipe_count,
    label        = EXCLUDED.label,
    created_at   = EXCLUDED.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_save_backup(uuid, jsonb, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_backup(uuid, jsonb, integer, text) TO service_role;
