-- Primo ciclo reale dopo la pubblicazione del processore corretto. Viene
-- applicato dal controllo post-deploy, quindi la funzione Edge è già online.
SELECT net.http_post(
  url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/process-lead-nurture',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'service_role_key'
      LIMIT 1
    )
  ),
  body := '{"source":"post_deploy_verification"}'::jsonb,
  timeout_milliseconds := 120000
);
