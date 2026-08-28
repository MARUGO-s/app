-- レート制限を管理するテーブル
-- Gemini API などの高コストなAPI呼び出しを制限するために使用

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 複合ユニークキー（同じユーザー・エンドポイント・時間窓に対して1レコードのみ）
  CONSTRAINT unique_user_endpoint_window UNIQUE (user_id, endpoint, window_start)
);
-- インデックス作成（検索パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint 
  ON api_rate_limits(user_id, endpoint, window_start DESC);
-- 古いレコードを自動削除（24時間以上前のレコード）
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM api_rate_limits
  WHERE window_start < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
-- コメント追加
COMMENT ON TABLE api_rate_limits IS 'API呼び出しのレート制限を管理するテーブル';
COMMENT ON COLUMN api_rate_limits.user_id IS 'ユーザーID（auth.users.idまたは匿名ID）';
COMMENT ON COLUMN api_rate_limits.endpoint IS 'APIエンドポイント名（例: analyze-image, parse-delivery-pdf）';
COMMENT ON COLUMN api_rate_limits.request_count IS '現在の時間窓内でのリクエスト数';
COMMENT ON COLUMN api_rate_limits.window_start IS '時間窓の開始時刻';
