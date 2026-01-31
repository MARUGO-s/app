-- カテゴリー付き材料保存機能の追加
-- 既存のingredientsフィールドを拡張し、カテゴリー情報を含む構造をサポート

-- テーブルが存在しない場合はスキップ
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipes' AND table_schema = 'public') THEN
        RAISE NOTICE 'recipes table does not exist yet, skipping this migration';
        RETURN;
    END IF;

    -- 1. 新しいカラムを追加（カテゴリー構造化された材料）
    ALTER TABLE recipes ADD COLUMN IF NOT EXISTS categorized_ingredients JSONB DEFAULT '[]'::jsonb;

    -- 2. カテゴリーメタデータカラムを追加
    ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ingredient_categories JSONB DEFAULT '[]'::jsonb;

    -- 3. レシピの複雑度フラグを追加
    ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_complex BOOLEAN DEFAULT false;

    -- 4. 元のレシピ言語を追加
    ALTER TABLE recipes ADD COLUMN IF NOT EXISTS original_language TEXT DEFAULT 'ja';

    -- 5. 翻訳済みレシピデータを追加
    ALTER TABLE recipes ADD COLUMN IF NOT EXISTS translated_data JSONB;

    -- 6. インデックスを作成してパフォーマンス向上
    CREATE INDEX IF NOT EXISTS idx_recipes_is_complex ON recipes(is_complex);
    CREATE INDEX IF NOT EXISTS idx_recipes_original_language ON recipes(original_language);
    CREATE INDEX IF NOT EXISTS idx_recipes_categorized_ingredients ON recipes USING gin(categorized_ingredients);
    CREATE INDEX IF NOT EXISTS idx_recipes_ingredient_categories ON recipes USING gin(ingredient_categories);

    -- 7. コメントを追加して構造を説明
    COMMENT ON COLUMN recipes.categorized_ingredients IS 'カテゴリー別に構造化された材料データ: [{"category": "BASE", "title": "ベース材料", "items": [{"item": "Flour", "quantity": "100", "unit": "g"}]}]';
    COMMENT ON COLUMN recipes.ingredient_categories IS 'カテゴリーメタデータ: [{"id": "base", "title": "ベース材料", "titleEn": "BASE", "count": 3}]';
    COMMENT ON COLUMN recipes.is_complex IS '複雑なレシピかどうか（カテゴリー分けが必要）';
    COMMENT ON COLUMN recipes.original_language IS '元のレシピの言語コード（ja, en, fr, it, de, es）';
    COMMENT ON COLUMN recipes.translated_data IS '翻訳されたレシピデータ（複数言語対応）';

    -- 8. 既存のRLSポリシーは継承される
END $$;

