-- L'orologio dei solleciti EneaSubito: ogni ora, al minuto 23.
--
-- La chiave NON si scrive qui. Questo repository e' pubblico su GitHub: una
-- chiave scritta in una migrazione e' una chiave regalata a chiunque, per
-- sempre, anche se poi la si cancella (resta nella cronologia). Si legge
-- dalla cassaforte del database, come fanno gli altri orologi del progetto.
--
-- Chi spedisce davvero lo decide l'interruttore SOLLECITI_ATTIVI nei segreti
-- della funzione, non questo orologio: finche' e' spento, il giro gira e non
-- manda niente. Cosi' l'orologio si puo' accendere prima, e si vede nei
-- registri che gira bene, senza che parta una mail.

SELECT cron.unschedule('eneasubito-solleciti-hourly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'eneasubito-solleciti-hourly'
);

SELECT cron.schedule('eneasubito-solleciti-hourly', '23 * * * *', $$
  SELECT net.http_post(
    url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/eneasubito-solleciti',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
