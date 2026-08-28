-- API使用ログの閲覧権限を管理者のみに戻す

DROP POLICY IF EXISTS "ログインユーザーは閲覧可能" ON api_usage_logs;
DROP POLICY IF EXISTS "全ユーザー閲覧可能" ON api_usage_logs;
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
