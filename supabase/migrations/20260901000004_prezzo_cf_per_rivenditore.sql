-- Prezzo personalizzato del servizio "a carico del cliente finale" PER
-- RIVENDITORE.
--
-- Alcune aziende hanno condizioni proprie: il cliente finale di Sima Home
-- paga 100 € + IVA invece dei 150 € + IVA standard. Il prezzo va risolto
-- SEMPRE lato server (RPC + stripe-checkout): il browser mostra soltanto.
--
-- NULL = prezzo standard di piattaforma (platform_settings.prezzo_privato_enea).
-- L'aliquota IVA resta quella di piattaforma per tutti: cambia solo
-- l'imponibile concordato.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS prezzo_cf_imponibile_cents integer
  CHECK (prezzo_cf_imponibile_cents IS NULL OR prezzo_cf_imponibile_cents >= 100);

COMMENT ON COLUMN public.companies.prezzo_cf_imponibile_cents IS
  'Imponibile in centesimi del servizio pagato dal cliente finale di questo rivenditore. NULL = listino standard (platform_settings.prezzo_privato_enea). IVA sempre da piattaforma.';

-- La pagina /paga deve mostrare il prezzo GIUSTO per quella pratica: lo
-- calcola la RPC, non il frontend, così browser e Stripe non possono mai
-- divergere.
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
  totale_cents integer
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
    ROUND(COALESCE(c.prezzo_cf_imponibile_cents, l.imponibile_cents) * (1 + l.iva_percent / 100))::integer
  FROM public.enea_practices ep
  LEFT JOIN public.companies c ON c.id = ep.reseller_id
  CROSS JOIN listino l
  WHERE ep.form_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_pagamento_by_form_token(text) TO anon, authenticated;

-- Caso concreto che motiva tutto questo: Sima Home → 100 € + IVA.
UPDATE public.companies
SET prezzo_cf_imponibile_cents = 10000
WHERE ragione_sociale ILIKE '%sima home%';
