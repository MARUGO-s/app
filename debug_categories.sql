-- 1. categoriesテーブルの現在の状態を確認
SELECT * FROM categories ORDER BY created_at DESC;

-- 2. categoriesテーブルの権限（RLS）を確認
SELECT * FROM pg_policies WHERE tablename = 'categories';

-- 3. 現在のRLS設定を確認
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'categories';

-- 4. カテゴリーの使用状況を確認（レシピとの関連）
SELECT 
    c.name as category_name,
    COUNT(r.id) as recipe_count
FROM categories c
LEFT JOIN recipes r ON r.category = c.name
GROUP BY c.name
ORDER BY recipe_count DESC;

-- 5. 削除権限のポリシーを追加（まだ存在しない場合）
CREATE POLICY IF NOT EXISTS "Everyone can delete categories" ON categories
  FOR DELETE USING (true);

-- 6. すべての権限を確認
CREATE POLICY IF NOT EXISTS "Everyone can update categories" ON categories
  FOR UPDATE USING (true);

-- 7. 現在のポリシー一覧を再確認
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'categories'
ORDER BY policyname;

