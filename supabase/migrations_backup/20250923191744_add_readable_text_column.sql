-- 読みやすいテキスト形式のカラムを追加
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipes' AND table_schema = 'public') THEN
        RAISE NOTICE 'recipes table does not exist yet, skipping this migration';
        RETURN;
    END IF;

    ALTER TABLE recipes 
    ADD COLUMN IF NOT EXISTS readable_text TEXT;

    -- インデックスを追加（必要に応じて）
    CREATE INDEX IF NOT EXISTS idx_recipes_readable_text ON recipes USING GIN (to_tsvector('english', readable_text));
END $$;
