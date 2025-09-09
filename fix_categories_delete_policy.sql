-- 現在のポリシーを確認
SELECT * FROM pg_policies WHERE tablename = 'categories';

-- 削除権限のポリシーを追加（構文修正版）
CREATE POLICY "Enable delete for all users" ON categories
    FOR DELETE USING (true);

-- すべての権限を再設定
DROP POLICY IF EXISTS "Everyone can view categories" ON categories;
DROP POLICY IF EXISTS "Everyone can insert categories" ON categories;
DROP POLICY IF EXISTS "Everyone can delete categories" ON categories;

CREATE POLICY "Enable all operations for all users" ON categories
    FOR ALL USING (true) WITH CHECK (true);

-- テスト削除
DELETE FROM categories WHERE name = 'デセール';
SELECT * FROM categories;
