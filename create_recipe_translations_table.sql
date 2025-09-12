-- レシピ翻訳テーブルの作成
-- メニュー名の多言語対応用

CREATE TABLE IF NOT EXISTS recipe_translations (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  language_code VARCHAR(10) NOT NULL, -- 'fr', 'it', 'ja', 'zh', 'es', 'de', 'en'
  translated_title TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(recipe_id, language_code)
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_recipe_translations_recipe_id ON recipe_translations(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_translations_language_code ON recipe_translations(language_code);

-- コメント
COMMENT ON TABLE recipe_translations IS 'レシピの多言語翻訳テーブル';
COMMENT ON COLUMN recipe_translations.recipe_id IS 'レシピID（外部キー）';
COMMENT ON COLUMN recipe_translations.language_code IS '言語コード（fr, it, ja, zh, es, de, en）';
COMMENT ON COLUMN recipe_translations.translated_title IS '翻訳された料理名';
