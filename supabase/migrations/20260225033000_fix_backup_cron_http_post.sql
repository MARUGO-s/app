-- Fix daily backup cron job command.
-- Root cause:
-- - pg_net exposes net.http_post(...)
-- - existing job calls extensions.http_post(...) with body cast as text
--   which fails at runtime on cron execution.

-- Recreate job idempotently.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'daily-account-backup';

-- Run daily at UTC 15:00 (= JST 00:00 next day).
SELECT cron.schedule(
  'daily-account-backup',
  '0 15 * * *',
  $$
    SELECT net.http_post(
      url      := 'https://hocbnifuactbvmyjraxy.supabase.co/functions/v1/scheduled-backup',
      headers  := '{"Content-Type":"application/json"}'::jsonb,
      body     := '{}'::jsonb
    );
  $$
);
