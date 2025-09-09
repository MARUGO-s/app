-- カテゴリーテーブルを作成
CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) を有効化
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 誰でも読み取り可能なポリシーを作成
CREATE POLICY "Everyone can view categories" ON categories
  FOR SELECT USING (true);

-- 誰でも挿入可能なポリシーを作成  
CREATE POLICY "Everyone can insert categories" ON categories
  FOR INSERT WITH CHECK (true);

-- インデックスを作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- コメントを追加
COMMENT ON TABLE categories IS 'レシピのカテゴリー情報を格納するテーブル';
COMMENT ON COLUMN categories.id IS '主キー';
COMMENT ON COLUMN categories.name IS 'カテゴリー名（ユニーク）';
COMMENT ON COLUMN categories.created_at IS '作成日時';
COMMENT ON COLUMN categories.updated_at IS '更新日時';
