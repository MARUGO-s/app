-- API使用ログを記録するテーブル
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- API情報
  api_name TEXT NOT NULL,  -- 'gemini', 'openai', 'deepl', 'azure', 'groq', 'avalon'
  endpoint TEXT NOT NULL,  -- Edge Function名 (例: 'analyze-image', 'parse-delivery-pdf')
  model_name TEXT,  -- 使用したモデル名 (例: 'gemini-1.5-flash', 'gpt-4o-mini')
  
  -- ユーザー情報
  user_id UUID,
  user_email TEXT,
  
  -- リクエスト情報
  request_size_bytes INTEGER,
  response_size_bytes INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  
  -- 結果情報
  status TEXT NOT NULL,  -- 'success', 'error', 'rate_limited'
  error_message TEXT,
  duration_ms INTEGER,  -- 処理時間（ミリ秒）
  
  -- コスト推定(オプション)
  estimated_cost_jpy DECIMAL(10, 2),
  
  -- メタデータ
  metadata JSONB  -- その他の追加情報
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_api_name ON api_usage_logs(api_name);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_endpoint ON api_usage_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_status ON api_usage_logs(status);

-- 古いログを自動削除する関数（90日以上前）
CREATE OR REPLACE FUNCTION cleanup_old_api_usage_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM api_usage_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- 管理者のみアクセス可能にするRLSポリシー
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

-- 管理者のみ全データを閲覧可能
CREATE POLICY "管理者のみ閲覧可能" ON api_usage_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- サービスロール（Edge Function）は常に挿入可能
CREATE POLICY "サービスロールは挿入可能" ON api_usage_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- コメント
COMMENT ON TABLE api_usage_logs IS 'API使用ログ（管理者専用）';
COMMENT ON COLUMN api_usage_logs.api_name IS 'API名（gemini, openai, deepl等）';
COMMENT ON COLUMN api_usage_logs.endpoint IS 'Edge Function名';
COMMENT ON COLUMN api_usage_logs.model_name IS '使用したAIモデル名';
COMMENT ON COLUMN api_usage_logs.estimated_cost_jpy IS '推定コスト（円）';
