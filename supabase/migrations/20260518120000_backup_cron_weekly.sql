-- 自動バックアップを毎日から毎週1回に変更（日曜 UTC 15:00 = 月曜 0:00 JST）

BEGIN;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('daily-account-backup', 'weekly-account-backup');

SELECT cron.schedule(
  'weekly-account-backup',
  '0 15 * * 0',
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
