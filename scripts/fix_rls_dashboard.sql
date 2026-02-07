
-- ユーザー様へ: このスクリプトをSupabaseのDashboardにある「SQL Editor」で実行してください。
-- To User: Please run this script in the "SQL Editor" of your Supabase Dashboard.

-- 1. レシピテーブルのRLSを有効化（念の為）
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- 2. 既存の（制限がきつい）ポリシーを削除
DROP POLICY IF EXISTS "recipes_select_policy_v3" ON public.recipes;
DROP POLICY IF EXISTS "recipes_select_policy_v2" ON public.recipes;
DROP POLICY IF EXISTS "recipes_select_policy" ON public.recipes;
DROP POLICY IF EXISTS "Public read access for recipes" ON public.recipes;

-- 3. 「誰でも読み取り可能」なポリシーを作成
-- アプリケーション側でフィルタリングを行っているため、DB側は許可します。
CREATE POLICY "Public read access for recipes"
ON public.recipes FOR SELECT
USING (true);
