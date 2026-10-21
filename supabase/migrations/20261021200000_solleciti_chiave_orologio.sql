-- L'orologio dei solleciti EneaSubito con una chiave sua.
--
-- Dal 17/10 al 21/10/2026 ogni giro orario e' tornato 401 «non autorizzato»:
-- la funzione confrontava il Bearer con la chiave di servizio del suo
-- ambiente, e quella della cassaforte non coincideva. Nessun sollecito e'
-- mai partito. Ora l'orologio presenta anche `x-solleciti-chiave`, letta
-- dalla cassaforte (`solleciti_chiave`), che la funzione confronta con il
-- suo segreto `SOLLECITI_CHIAVE`. I due valori si creano insieme, con un
-- solo comando, e non passano da nessuna chat.
--
-- Rieseguibile: toglie e rimette il lavoro con lo stesso nome.

DO $$
BEGIN
  PERFORM cron.unschedule('eneasubito-solleciti-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'eneasubito-solleciti-hourly',
  '23 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/eneasubito-solleciti',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key' LIMIT 1
      ),
      'x-solleciti-chiave', (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'solleciti_chiave' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
