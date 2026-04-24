-- ============================================================
-- Fix C — Rimuovi JWT in chiaro da cron.job, sposta in Vault
--
-- Problema: i cron job (process-automations-daily, send-reminders-daily)
-- avevano il service_role_key JWT hardcoded dentro cron.job.command.
-- Chiunque con SELECT su cron.job (ruoli privilegiati Postgres) poteva
-- leggerlo — inclusi sviluppatori che accedono al dashboard Studio.
--
-- Soluzione: salvare la chiave in supabase_vault e leggerla runtime
-- tramite vault.decrypted_secrets (accessibile solo da ruolo postgres,
-- che è ciò che esegue pg_cron).
--
-- SETUP REQUIREMENT (eseguito una tantum):
--   SELECT vault.create_secret('<SR_KEY>', 'service_role_key', '...');
--
-- Quando la chiave ruota:
--   SELECT vault.update_secret(
--     (SELECT id FROM vault.secrets WHERE name = 'service_role_key'),
--     '<NEW_KEY>'
--   );
-- I cron riprendono automaticamente la nuova chiave al prossimo run.
-- ============================================================

-- Rischedule process-automations-daily con lettura da Vault
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-automations-daily') THEN
    PERFORM cron.unschedule('process-automations-daily');
  END IF;
END
$$;

SELECT cron.schedule(
  'process-automations-daily',
  '0 9 * * *',
  $cronbody$
  SELECT net.http_post(
    url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/process-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cronbody$
);

-- Rischedule send-reminders-daily con lettura da Vault
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-reminders-daily') THEN
    PERFORM cron.unschedule('send-reminders-daily');
  END IF;
END
$$;

SELECT cron.schedule(
  'send-reminders-daily',
  '0 9 * * *',
  $cronbody$
  SELECT net.http_post(
    url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cronbody$
);
