-- Enable pg_cron extension (required for scheduled jobs)
-- Must be enabled in schema "pg_catalog" on Supabase
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Grant usage on cron schema to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Enable pg_net for HTTP calls from within Postgres
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the send-reminders Edge Function to run daily at 09:00 UTC
SELECT cron.schedule(
  'send-reminders-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  )
  $$
);
