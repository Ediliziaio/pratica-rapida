-- =============================================
-- PRATICA RAPIDA v2.0 — Migration: Cron for process-automations
-- =============================================
-- Schedules the `process-automations` Edge Function to run daily so that
-- all recurrent automations actually fire:
--   • Messaggio 2 — sollecito compilazione form ogni 7gg
--   • Notifica B — solleciti fornitore a 30/60/90gg
--   • Messaggio 5 — sollecito recensione dopo 7gg da richiesta
--
-- SETUP REQUIREMENT
-- Before this migration can work, these database-level settings must be
-- configured once (they are NOT version-controlled because they contain
-- the service-role key). Run in the Supabase SQL editor as a superuser:
--
--   ALTER DATABASE postgres
--     SET app.settings.supabase_url = 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co';
--   ALTER DATABASE postgres
--     SET app.settings.service_role_key = '<service-role-key>';
--
-- After setting them, either reconnect the session or restart the DB for
-- `current_setting(...)` to pick them up.
--
-- SCHEDULING NOTE
-- The function itself is idempotent per-day (it checks `business_hours`
-- and last-sent timestamps). We schedule once per day at 09:00 UTC, which
-- falls inside the 9-18 Rome business window in both CET (10:00 local)
-- and CEST (11:00 local), so one firing per day is sufficient.
-- =============================================

-- Enable extensions needed for pg_cron + outbound HTTP
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing schedule for this job (safe re-run)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-automations-daily') THEN
    PERFORM cron.unschedule('process-automations-daily');
  END IF;
END
$$;

-- Schedule: every day at 09:00 UTC
SELECT cron.schedule(
  'process-automations-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/process-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
