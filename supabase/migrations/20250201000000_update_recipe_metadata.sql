-- レシピ関連メタデータの拡張
-- 実行日: 2025年2月1日

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipes' AND table_schema = 'public') THEN
        RAISE NOTICE 'recipes table does not exist yet, skipping this migration';
        RETURN;
    END IF;

    -- 1. Groq API 由来レシピ判定フラグ
    ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_groq_generated BOOLEAN DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS idx_recipes_is_groq_generated ON recipes(is_groq_generated);
    COMMENT ON COLUMN recipes.is_groq_generated IS 'Groq APIを使用して生成されたレシピかどうかを示すフラグ';

    -- 2. レシピテーブルのカラム追加
    ALTER TABLE recipes ADD COLUMN IF NOT EXISTS display_format VARCHAR(20) DEFAULT 'normal';
    ALTER TABLE recipes ADD COLUMN IF NOT EXISTS language_code VARCHAR(10);
    ALTER TABLE recipes ADD COLUMN IF NOT EXISTS original_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;
    ALTER TABLE recipes ADD COLUMN IF NOT EXISTS translation_layout JSONB;

    CREATE INDEX IF NOT EXISTS idx_recipes_display_format ON recipes(display_format);
    CREATE INDEX IF NOT EXISTS idx_recipes_language_code ON recipes(language_code);
    CREATE INDEX IF NOT EXISTS idx_recipes_original_recipe_id ON recipes(original_recipe_id);
    CREATE INDEX IF NOT EXISTS idx_recipes_translation_layout ON recipes USING GIN (translation_layout);

    COMMENT ON COLUMN recipes.display_format IS '表示形式（normal, htmlなど）';
    COMMENT ON COLUMN recipes.language_code IS '翻訳言語コード';
    COMMENT ON COLUMN recipes.original_recipe_id IS '元のレシピID（翻訳レシピの場合）';
    COMMENT ON COLUMN recipes.translation_layout IS '翻訳レイアウト保持情報';

    -- 3. HTMLコンテンツカラムを追加（テーブルが存在する場合のみ）
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_ingredients' AND table_schema = 'public') THEN
        ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS html_content TEXT;
        COMMENT ON COLUMN recipe_ingredients.html_content IS '材料のHTML形式コンテンツ';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_steps' AND table_schema = 'public') THEN
        ALTER TABLE recipe_steps ADD COLUMN IF NOT EXISTS html_content TEXT;
        COMMENT ON COLUMN recipe_steps.html_content IS '手順のHTML形式コンテンツ';
        
        -- 4. recipe_steps.step_number カラムの厳格化（データが存在する場合）
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipe_steps' AND column_name = 'position') THEN
            UPDATE recipe_steps
            SET step_number = position
            WHERE step_number IS NULL AND position IS NOT NULL;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipe_steps' AND column_name = 'step_number') THEN
            ALTER TABLE recipe_steps ALTER COLUMN step_number DROP NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_recipe_steps_step_number ON recipe_steps(recipe_id, step_number);
            COMMENT ON COLUMN recipe_steps.step_number IS '手順の番号（1から開始）';
        END IF;
    END IF;

    -- 5. recipe_translations テーブルの整備
    CREATE TABLE IF NOT EXISTS recipe_translations (
      id SERIAL PRIMARY KEY,
      recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
      language_code VARCHAR(10) NOT NULL,
      translated_title TEXT NOT NULL,
      html_content TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(recipe_id, language_code)
    );

    CREATE INDEX IF NOT EXISTS idx_recipe_translations_recipe_id ON recipe_translations(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_recipe_translations_language_code ON recipe_translations(language_code);

    COMMENT ON TABLE recipe_translations IS 'レシピの多言語翻訳テーブル';
    COMMENT ON COLUMN recipe_translations.recipe_id IS 'レシピID（外部キー）';
    COMMENT ON COLUMN recipe_translations.language_code IS '翻訳言語コード';
    COMMENT ON COLUMN recipe_translations.translated_title IS '翻訳された料理名';
    COMMENT ON COLUMN recipe_translations.html_content IS '翻訳タイトルのHTML形式コンテンツ';
END $$;
