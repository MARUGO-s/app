-- 翻訳レシピテーブルにJSONB列を追加
-- フロントエンドコードとの整合性を保つため

-- translation_recipesテーブルにJSONB列を追加
ALTER TABLE translation_recipes 
ADD COLUMN IF NOT EXISTS translated_ingredients JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS translated_steps JSONB DEFAULT '[]'::jsonb;

-- コメントの追加
COMMENT ON COLUMN translation_recipes.translated_ingredients IS '翻訳された材料データ（JSONB形式）';
COMMENT ON COLUMN translation_recipes.translated_steps IS '翻訳された手順データ（JSONB形式）';

-- インデックスの作成（JSONB列用）
CREATE INDEX IF NOT EXISTS idx_translation_recipes_translated_ingredients ON translation_recipes USING GIN (translated_ingredients);
CREATE INDEX IF NOT EXISTS idx_translation_recipes_translated_steps ON translation_recipes USING GIN (translated_steps);
