-- Allinea il riepilogo finanziario al prezzo realmente usato dal checkout CF
-- e rimuove l'avviso storico "da abbinare" quando la pratica e' gia stata
-- assegnata a un rivenditore reale.

DO $$
DECLARE
  v_standard_cents integer;
  v_sima_cents integer;
  v_sima_company_id uuid;
BEGIN
  SELECT (value->>'imponibile_cents')::integer
    INTO v_standard_cents
    FROM public.platform_settings
   WHERE key = 'prezzo_cf_standard';

  SELECT (value->>'imponibile_cents')::integer
    INTO v_sima_cents
    FROM public.platform_settings
   WHERE key = 'prezzo_cf_sima_home';

  SELECT NULLIF(value->>'company_id', '')::uuid
    INTO v_sima_company_id
    FROM public.platform_settings
   WHERE key = 'cf_sima_home_company_id';

  IF v_standard_cents IS NULL OR v_standard_cents <= 0
     OR v_sima_cents IS NULL OR v_sima_cents <= 0
     OR v_sima_company_id IS NULL THEN
    RAISE EXCEPTION 'Configurazione prezzi CF incompleta: migrazione annullata';
  END IF;

  UPDATE public.enea_practices
     SET prezzo = COALESCE(
       (
         SELECT o.imponibile_cents / 100.0
           FROM public.cf_payment_orders o
          WHERE o.practice_id = enea_practices.id
          LIMIT 1
       ),
       CASE
         WHEN reseller_id = v_sima_company_id THEN v_sima_cents / 100.0
         ELSE v_standard_cents / 100.0
       END
     )
   WHERE tipo_fatturazione = 'cliente_finale'
     AND pagamento_stato = 'non_pagata';
END $$;

DROP POLICY IF EXISTS "Authenticated reads CF pricing" ON public.platform_settings;
CREATE POLICY "Authenticated reads CF pricing"
  ON public.platform_settings FOR SELECT TO authenticated
  USING (key IN (
    'prezzo_cf_standard',
    'prezzo_cf_sima_home',
    'cf_sima_home_company_id'
  ));

UPDATE public.enea_practices p
   SET note = NULLIF(
     btrim(
       regexp_replace(
         p.note,
         '(?m)^.*AZIENDA NON TROVATA.*pratica DA ABBINARE.*(?:\n|$)',
         '',
         'g'
       )
     ),
     ''
   )
 WHERE p.note ILIKE '%AZIENDA NON TROVATA%'
   AND p.reseller_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.companies c
      WHERE c.id = p.reseller_id
        AND c.ragione_sociale ILIKE '%Da abbinare%'
   );
