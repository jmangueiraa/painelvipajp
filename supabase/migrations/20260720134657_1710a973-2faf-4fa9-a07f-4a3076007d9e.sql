
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-cron-tick') THEN
    PERFORM cron.unschedule('push-cron-tick');
  END IF;
END $$;

SELECT cron.schedule(
  'push-cron-tick',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://painelvipajp.lovable.app/api/public/push-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_CPHAd-IwFh9ydxsC5lRHlg_q-iJBGYF'
    ),
    body := '{}'::jsonb
  );
  $$
);
