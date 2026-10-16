-- Toglie la chiave del webhook Meta dal codice pubblico.
--
-- La migrazione del 05/10/2026 (20261005170000_meta_leads_sync_cron.sql) ha
-- scritto il VERIFY_TOKEN dentro l'indirizzo dell'orologio. Questo
-- repository e' PUBBLICO su GitHub: quella chiave e' leggibile da chiunque, e
-- resta leggibile nella cronologia anche dopo essere stata cancellata dal
-- file. Con quella chiave, da internet, si puo' far ripartire l'importazione
-- dei lead (che scrive pratiche nel CRM e manda e-mail), toccare l'iscrizione
-- dell'app alla Pagina e leggere la diagnostica del token Meta.
--
-- Quindi: la chiave va CAMBIATA, non solo spostata. Nell'ordine:
--   1. generare una chiave nuova;
--   2. metterla in cassaforte:
--        SELECT vault.create_secret('<CHIAVE NUOVA>', 'meta_verify_token', 'Verify token del webhook Meta');
--      (se il segreto esiste gia', usare vault.update_secret)
--   3. metterla nei segreti della funzione come META_VERIFY_TOKEN;
--   4. metterla su Meta, nella configurazione del webhook;
--   5. applicare questa migrazione.
--
-- Il passo 5 per ultimo: se si applica prima, l'orologio manda una chiave che
-- la funzione non riconosce e la rete di sicurezza sui lead smette di
-- funzionare in silenzio. Per questo qui sotto si rifiuta di partire se la
-- chiave in cassaforte non c'e'.

DO $guardia$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'meta_verify_token'
  ) THEN
    RAISE EXCEPTION
      'Manca il segreto meta_verify_token in cassaforte: esegui prima il passo 2, altrimenti l''orologio dei lead si rompe in silenzio.';
  END IF;
END
$guardia$;

SELECT cron.unschedule('meta-leads-sync-hourly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'meta-leads-sync-hourly'
);

SELECT cron.schedule('meta-leads-sync-hourly', '7 * * * *', $$
  SELECT net.http_get(
    url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/meta-leads-webhook'
           || '?action=import_recent&days=30&token='
           || (
             SELECT decrypted_secret
             FROM vault.decrypted_secrets
             WHERE name = 'meta_verify_token'
             LIMIT 1
           ),
    timeout_milliseconds := 120000
  );
$$);
