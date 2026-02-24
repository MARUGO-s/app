-- pg_cron + pg_net を使って毎日 JST 0:00 に自動バックアップを実行する設定

-- pg_cron を有効化（Supabase では extensions スキーマに作成）
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pg_net を有効化
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- 既存の同名ジョブがあれば削除してから登録（冪等実行）
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'daily-account-backup';

-- 毎日 UTC 15:00（= JST 0:00）に scheduled-backup Edge Function を呼び出す
SELECT cron.schedule(
  'daily-account-backup',
  '0 15 * * *',
  $$
    SELECT extensions.http_post(
      url      := 'https://hocbnifuactbvmyjraxy.supabase.co/functions/v1/scheduled-backup',
      headers  := '{"Content-Type":"application/json"}'::jsonb,
      body     := '{}'::text
    );
  $$
);
