-- デプロイ履歴を管理するテーブル
CREATE TABLE IF NOT EXISTS deploy_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project TEXT NOT NULL,  -- 'git', 'supabase', 'frontend' など
    type TEXT NOT NULL,     -- 'commit', 'deploy', 'migration' など
    message TEXT,           -- デプロイの内容やコミットメッセージ
    actor TEXT,             -- 実行者（例: 'yoshito', 'github-actions'）
    status TEXT,            -- 'success', 'error', 'pending'
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_deploy_logs_created_at ON deploy_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deploy_logs_project ON deploy_logs(project);

-- RLS設定
ALTER TABLE deploy_logs ENABLE ROW LEVEL SECURITY;

-- 管理者は全ての操作が可能
CREATE POLICY "管理者のみ全操作可能" ON deploy_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- サービスロールは常に全操作可能（外部連携・Webhook用）
CREATE POLICY "サービスロールは全操作可能" ON deploy_logs
  FOR ALL
  TO service_role
  USING (true);

COMMENT ON TABLE deploy_logs IS 'デプロイおよびコミット履歴（管理者専用）';
