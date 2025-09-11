-- recipe_translationsテーブルエラーを修正するSQLスクリプト

-- 1. recipe_translationsテーブルが存在しない場合は作成
CREATE TABLE IF NOT EXISTS recipe_translations (
  id SERIAL PRIMARY KEY,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  language_code VARCHAR(10) NOT NULL,
  translated_title TEXT NOT NULL,
  html_content TEXT, -- HTML形式のコンテンツ用カラム
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(recipe_id, language_code)
);

-- 2. インデックスの作成
CREATE INDEX IF NOT EXISTS idx_recipe_translations_recipe_id ON recipe_translations(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_translations_language_code ON recipe_translations(language_code);

-- 3. 既存のテーブルにHTML形式カラムを追加
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS html_content TEXT;
ALTER TABLE recipe_steps ADD COLUMN IF NOT EXISTS html_content TEXT;

-- 4. recipesテーブルにHTML形式のフラグと関連カラムを追加
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS display_format VARCHAR(20) DEFAULT 'normal';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS language_code VARCHAR(10);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS original_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;

-- 5. インデックスの追加
CREATE INDEX IF NOT EXISTS idx_recipes_display_format ON recipes(display_format);
CREATE INDEX IF NOT EXISTS idx_recipes_language_code ON recipes(language_code);
CREATE INDEX IF NOT EXISTS idx_recipes_original_recipe_id ON recipes(original_recipe_id);

-- 6. コメントの追加
COMMENT ON TABLE recipe_translations IS 'レシピの多言語翻訳テーブル';
COMMENT ON COLUMN recipe_translations.recipe_id IS 'レシピID（外部キー）';
COMMENT ON COLUMN recipe_translations.language_code IS '言語コード（fr, it, ja, zh, es, de, en）';
COMMENT ON COLUMN recipe_translations.translated_title IS '翻訳された料理名';
COMMENT ON COLUMN recipe_translations.html_content IS '翻訳タイトルのHTML形式コンテンツ';
COMMENT ON COLUMN recipe_ingredients.html_content IS '材料のHTML形式コンテンツ';
COMMENT ON COLUMN recipe_steps.html_content IS '手順のHTML形式コンテンツ';
COMMENT ON COLUMN recipes.display_format IS '表示形式（normal, html）';
COMMENT ON COLUMN recipes.language_code IS '翻訳言語コード';
COMMENT ON COLUMN recipes.original_recipe_id IS '元のレシピID（翻訳レシピの場合）';
