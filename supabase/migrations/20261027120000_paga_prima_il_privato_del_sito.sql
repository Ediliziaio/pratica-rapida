-- Il privato del sito paga prima di compilare.
--
-- Decisione del Titolare del 27/10: chi arriva dalla pagina pubblica lascia
-- contatto e prodotto, paga, e solo dopo compila. Prima era il contrario, e
-- la pagina di pagamento rimbalzava tutti sul modulo.
--
-- Quel rimbalzo serve ancora, ma a un'altra cosa: al cliente finale di un
-- rivenditore, che compila e paga alla fine (rollout TS Pay). Per tenerli
-- separati la pagina deve poter distinguere i due casi, e il segno c'e' gia'
-- sulla pratica — `public_private_checkout_required`, scritto da
-- richiesta-pubblica. Mancava solo di farlo uscire dalla RPC.
--
-- Il nome dell'azienda non poteva servire allo scopo: questa stessa RPC
-- maschera di proposito i contenitori di sistema, quindi al privato del sito
-- risponde "la tua azienda installatrice" come a tutti gli altri.
--
-- Cambia solo l'elenco delle colonne restituite: nessun dato viene toccato.

DROP FUNCTION IF EXISTS public.get_pagamento_by_form_token(text);

CREATE OR REPLACE FUNCTION public.get_pagamento_by_form_token(p_token text)
RETURNS TABLE (
  cliente_nome text,
  cliente_cognome text,
  prodotto_installato text,
  tipo_servizio text,
  tipo_fatturazione text,
  pagamento_stato text,
  reseller_name text,
  archived_at timestamptz,
  imponibile_cents integer,
  iva_percent numeric,
  totale_cents integer,
  -- Vero solo per la richiesta nata sulla pagina pubblica da un privato.
  public_private_checkout_required boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  WITH listino AS (
    SELECT
      COALESCE((value->>'imponibile_cents')::integer, 0) AS imponibile_cents,
      COALESCE((value->>'iva_percent')::numeric, 0) AS iva_percent
    FROM public.platform_settings
    WHERE key = 'prezzo_privato_enea'
  )
  SELECT
    ep.cliente_nome,
    ep.cliente_cognome,
    ep.prodotto_installato,
    ep.tipo_servizio::text,
    ep.tipo_fatturazione::text,
    ep.pagamento_stato::text,
    -- Stessa regola di _shared/reseller.ts: i contenitori di sistema
    -- ("Da abbinare", "Clienti privati") non devono MAI comparire al cliente.
    CASE
      WHEN c.ragione_sociale IS NULL
        OR c.ragione_sociale LIKE '%Da abbinare%'
        OR c.ragione_sociale LIKE '%Clienti privati%'
      THEN COALESCE(NULLIF(btrim(ep.azienda_dichiarata), ''), 'la tua azienda installatrice')
      ELSE c.ragione_sociale
    END,
    ep.archived_at,
    COALESCE(c.prezzo_cf_imponibile_cents, l.imponibile_cents),
    l.iva_percent,
    ROUND(COALESCE(c.prezzo_cf_imponibile_cents, l.imponibile_cents) * (1 + l.iva_percent / 100))::integer,
    COALESCE(ep.public_private_checkout_required, false)
  FROM public.enea_practices ep
  LEFT JOIN public.companies c ON c.id = ep.reseller_id
  CROSS JOIN listino l
  WHERE ep.form_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_pagamento_by_form_token(text) TO anon, authenticated;
