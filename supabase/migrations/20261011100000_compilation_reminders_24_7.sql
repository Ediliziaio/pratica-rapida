-- Decisione del Titolare: esclusivamente i solleciti di compilazione
-- possono essere elaborati H24, sabato e domenica inclusi.
-- Tutte le altre automazioni mantengono le fasce operative esistenti.

SELECT cron.unschedule('process-compilation-reminders-hourly')
WHERE EXISTS (
  SELECT 1 FROM cron.job
  WHERE jobname = 'process-compilation-reminders-hourly'
);

SELECT cron.schedule('process-compilation-reminders-hourly', '7 * * * *', $$
  SELECT net.http_post(
    url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/process-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      )
    ),
    body := '{"trigger_group":"compilation_reminders"}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
