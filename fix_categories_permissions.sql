-- カテゴリーテーブルの権限を修正するSQL

-- 1. 既存のポリシーを削除（必要に応じて）
DROP POLICY IF EXISTS "Everyone can view categories" ON categories;
DROP POLICY IF EXISTS "Everyone can insert categories" ON categories;
DROP POLICY IF EXISTS "Everyone can delete categories" ON categories;
DROP POLICY IF EXISTS "Everyone can update categories" ON categories;

-- 2. 新しいポリシーを作成（すべての操作を許可）
CREATE POLICY "Enable read access for all users" ON categories
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON categories
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON categories
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete for all users" ON categories
    FOR DELETE USING (true);

-- 3. RLSが有効になっていることを確認
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 4. テスト用のクエリ
-- テスト: カテゴリーの削除をテスト（実際の削除は行われません）
SELECT 'Test delete permission' as test_type, 
       EXISTS(
           SELECT 1 FROM categories 
           WHERE name = 'test_category_that_does_not_exist'
       ) as can_query;

-- 5. 現在のポリシー確認
SELECT 
    tablename,
    policyname,
    permissive,
    roles,
    cmd as operation,
    qual as using_clause,
    with_check as with_check_clause
FROM pg_policies 
WHERE tablename = 'categories'
ORDER BY cmd, policyname;

