-- Fa partire subito un giro dei solleciti EneaSubito, come farebbe l'orologio.
SELECT net.http_post(
  url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/eneasubito-solleciti',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
    'x-solleciti-chiave', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'solleciti_chiave' LIMIT 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
) AS richiesta;
