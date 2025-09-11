-- 既存のテーブルにHTML形式のデータを保存するためのカラムを追加

-- recipe_ingredientsテーブルにhtml_contentカラムを追加
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS html_content TEXT;

-- recipe_stepsテーブルにhtml_contentカラムを追加
ALTER TABLE recipe_steps ADD COLUMN IF NOT EXISTS html_content TEXT;

-- recipe_translationsテーブルにhtml_contentカラムを追加
ALTER TABLE recipe_translations ADD COLUMN IF NOT EXISTS html_content TEXT;

-- recipesテーブルにHTML形式のフラグと関連カラムを追加
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS display_format VARCHAR(20) DEFAULT 'normal';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS language_code VARCHAR(10);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS original_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;

-- インデックスの追加
CREATE INDEX IF NOT EXISTS idx_recipes_display_format ON recipes(display_format);
CREATE INDEX IF NOT EXISTS idx_recipes_language_code ON recipes(language_code);
CREATE INDEX IF NOT EXISTS idx_recipes_original_recipe_id ON recipes(original_recipe_id);

-- コメントの追加
COMMENT ON COLUMN recipe_ingredients.html_content IS '材料のHTML形式コンテンツ';
COMMENT ON COLUMN recipe_steps.html_content IS '手順のHTML形式コンテンツ';
COMMENT ON COLUMN recipe_translations.html_content IS '翻訳タイトルのHTML形式コンテンツ';
COMMENT ON COLUMN recipes.display_format IS '表示形式（normal, html）';
COMMENT ON COLUMN recipes.language_code IS '翻訳言語コード';
COMMENT ON COLUMN recipes.original_recipe_id IS '元のレシピID（翻訳レシピの場合）';
