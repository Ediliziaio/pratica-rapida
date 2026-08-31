-- Pagina pubblica di pagamento /paga/:token per il CLIENTE FINALE.
--
-- Scenario: il rivenditore carica la pratica dal portale (o dal sito) e sceglie
-- "a carico del cliente finale". Il cliente riceve un link, apre la pagina,
-- capisce cosa sta pagando e paga. Solo dopo — e solo col servizio completo —
-- gli viene chiesto di compilare il modulo.
--
-- RPC dedicata invece di allargare `get_practice_by_form_token`: quella serve
-- al form e restituisce anche `note` (che contiene l'audit interno: match
-- azienda, "DA ABBINARE", ecc.) e `dati_form`. Qui esponiamo il minimo
-- indispensabile a un utente anonimo.

CREATE OR REPLACE FUNCTION public.get_pagamento_by_form_token(p_token text)
RETURNS TABLE (
  cliente_nome text,
  cliente_cognome text,
  prodotto_installato text,
  tipo_servizio text,
  tipo_fatturazione text,
  pagamento_stato text,
  reseller_name text,
  archived_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
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
    ep.archived_at
  FROM public.enea_practices ep
  LEFT JOIN public.companies c ON c.id = ep.reseller_id
  WHERE ep.form_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_pagamento_by_form_token(text) TO anon, authenticated;
