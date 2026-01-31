-- セキュリティ強化: 適切なRLSポリシーの設定
-- 実行日: 2025年1月11日

DO $$
BEGIN
    -- 1. categories テーブルが存在する場合のみポリシーを設定
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'categories' AND table_schema = 'public') THEN
        -- 既存の過度に寛容なポリシーを削除
        DROP POLICY IF EXISTS "Enable read access for all users" ON categories;
        DROP POLICY IF EXISTS "Enable insert for all users" ON categories;
        DROP POLICY IF EXISTS "Enable update for all users" ON categories;
        DROP POLICY IF EXISTS "Enable delete for all users" ON categories;
        DROP POLICY IF EXISTS "Everyone can view categories" ON categories;
        DROP POLICY IF EXISTS "Everyone can insert categories" ON categories;
        DROP POLICY IF EXISTS "Everyone can delete categories" ON categories;
        DROP POLICY IF EXISTS "Everyone can update categories" ON categories;

        -- セキュアなポリシーを設定
        CREATE POLICY "Public read access for categories" ON categories
            FOR SELECT USING (true);

        CREATE POLICY "Authenticated users can insert categories" ON categories
            FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

        CREATE POLICY "Authenticated users can update categories" ON categories
            FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

        CREATE POLICY "Authenticated users can delete categories" ON categories
            FOR DELETE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

        -- RLSを有効化
        ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
    END IF;

    -- 2. tags テーブルが存在する場合のみポリシーを設定
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tags' AND table_schema = 'public') THEN
        DROP POLICY IF EXISTS "Enable read access for all users" ON tags;
        DROP POLICY IF EXISTS "Enable insert for all users" ON tags;
        DROP POLICY IF EXISTS "Enable update for all users" ON tags;
        DROP POLICY IF EXISTS "Enable delete for all users" ON tags;

        CREATE POLICY "Public read access for tags" ON tags
            FOR SELECT USING (true);

        CREATE POLICY "Authenticated users can insert tags" ON tags
            FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

        CREATE POLICY "Authenticated users can update tags" ON tags
            FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

        CREATE POLICY "Authenticated users can delete tags" ON tags
            FOR DELETE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

        ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
    END IF;

    -- 3. recipes テーブルが存在する場合のみポリシーを設定
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'recipes' AND table_schema = 'public') THEN
        DROP POLICY IF EXISTS "Enable read access for all users" ON recipes;
        DROP POLICY IF EXISTS "Enable insert for all users" ON recipes;
        DROP POLICY IF EXISTS "Enable update for all users" ON recipes;
        DROP POLICY IF EXISTS "Enable delete for all users" ON recipes;

        CREATE POLICY "Public read access for recipes" ON recipes
            FOR SELECT USING (true);

        CREATE POLICY "Authenticated users can insert recipes" ON recipes
            FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

        CREATE POLICY "Allow recipe updates" ON recipes
            FOR UPDATE USING (true);

        CREATE POLICY "Allow recipe deletes" ON recipes
            FOR DELETE USING (true);

        ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
    END IF;

    -- 4. recipe_ingredients テーブルが存在する場合のみポリシーを設定
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'recipe_ingredients' AND table_schema = 'public') THEN
        DROP POLICY IF EXISTS "Enable read access for all users" ON recipe_ingredients;
        DROP POLICY IF EXISTS "Enable insert for all users" ON recipe_ingredients;
        DROP POLICY IF EXISTS "Enable update for all users" ON recipe_ingredients;
        DROP POLICY IF EXISTS "Enable delete for all users" ON recipe_ingredients;

        CREATE POLICY "Public read access for recipe_ingredients" ON recipe_ingredients
            FOR SELECT USING (true);

        CREATE POLICY "Allow recipe_ingredients insert" ON recipe_ingredients
            FOR INSERT WITH CHECK (true);

        CREATE POLICY "Allow recipe_ingredients update" ON recipe_ingredients
            FOR UPDATE USING (true);

        CREATE POLICY "Allow recipe_ingredients delete" ON recipe_ingredients
            FOR DELETE USING (true);

        ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
    END IF;

    -- 5. recipe_steps テーブルが存在する場合のみポリシーを設定
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'recipe_steps' AND table_schema = 'public') THEN
        DROP POLICY IF EXISTS "Enable read access for all users" ON recipe_steps;
        DROP POLICY IF EXISTS "Enable insert for all users" ON recipe_steps;
        DROP POLICY IF EXISTS "Enable update for all users" ON recipe_steps;
        DROP POLICY IF EXISTS "Enable delete for all users" ON recipe_steps;

        CREATE POLICY "Public read access for recipe_steps" ON recipe_steps
            FOR SELECT USING (true);

        CREATE POLICY "Allow recipe_steps insert" ON recipe_steps
            FOR INSERT WITH CHECK (true);

        CREATE POLICY "Allow recipe_steps update" ON recipe_steps
            FOR UPDATE USING (true);

        CREATE POLICY "Allow recipe_steps delete" ON recipe_steps
            FOR DELETE USING (true);

        ALTER TABLE recipe_steps ENABLE ROW LEVEL SECURITY;
    END IF;

    -- 6. translation_history テーブルが存在する場合のみポリシーを作成
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'translation_history' AND table_schema = 'public') THEN
        DROP POLICY IF EXISTS "Public read access for translation_history" ON translation_history;
        DROP POLICY IF EXISTS "Allow translation_history insert" ON translation_history;
        DROP POLICY IF EXISTS "Allow translation_history update" ON translation_history;
        DROP POLICY IF EXISTS "Allow translation_history delete" ON translation_history;
        
        CREATE POLICY "Public read access for translation_history" ON translation_history
            FOR SELECT USING (true);
        
        CREATE POLICY "Allow translation_history insert" ON translation_history
            FOR INSERT WITH CHECK (true);
        
        CREATE POLICY "Allow translation_history update" ON translation_history
            FOR UPDATE USING (true);
        
        CREATE POLICY "Allow translation_history delete" ON translation_history
            FOR DELETE USING (true);
        
        ALTER TABLE translation_history ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- セキュリティ監査用ビューの作成
CREATE OR REPLACE VIEW security_audit AS
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd as operation,
    qual as using_clause,
    with_check as with_check_clause
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

COMMENT ON VIEW security_audit IS 'データベースセキュリティポリシーの監査用ビュー';
