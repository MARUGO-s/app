-- Point daily backup cron to the migrated app-central project.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'daily-account-backup';

SELECT cron.schedule(
  'daily-account-backup',
  '0 15 * * *',
  $$
    SELECT net.http_post(
      url      := 'https://hjhkccbktkscwtgzxjfq.supabase.co/functions/v1/scheduled-backup',
      headers  := '{"Content-Type":"application/json"}'::jsonb,
      body     := '{}'::jsonb
    );
  $$
);
