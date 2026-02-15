-- 管理者だけでなく、認証済みユーザー全員が自分のログ（もしくは全ログ）を見れるようにする
-- 今回は要望通り「全員が見れる」ように全公開とする

DROP POLICY IF EXISTS "管理者のみ閲覧可能" ON api_usage_logs;

CREATE POLICY "ログインユーザーは閲覧可能" ON api_usage_logs
  FOR SELECT
  TO authenticated
  USING (true);
