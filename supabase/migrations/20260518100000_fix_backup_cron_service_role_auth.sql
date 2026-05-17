-- 定期バックアップ cron: scheduled-backup に service_role を渡す
-- 2026-05-01 の JWT 必須化以降、Authorization なしの net.http_post は 401 で失敗していた。
--
-- 初回のみ Vault にシークレットが無い場合は SQL Editor で実行:
-- SELECT vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY>', 'service_role_key', 'Cron: scheduled-backup');

BEGIN;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'daily-account-backup';

SELECT cron.schedule(
  'daily-account-backup',
  '0 15 * * *',
  $$
    SELECT net.http_post(
      url := 'https://hjhkccbktkscwtgzxjfq.supabase.co/functions/v1/scheduled-backup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
          ''
        )
      ),
      body := '{}'::jsonb
    );
  $$
);

COMMIT;
