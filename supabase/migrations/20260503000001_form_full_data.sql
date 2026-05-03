-- ============================================================
-- Form pubblico cliente finale — dati completi
--
-- Specifica utente: il form al cliente finale deve raccogliere
-- ~6 sezioni di dati (richiedente, indirizzi, catastali, edificio,
-- impianto, dati prodotto-specifici).
--
-- Strategia: campo JSONB unico `dati_form` su enea_practices.
-- Vantaggi:
--   · Estensibile senza migrations per ogni nuovo campo
--   · La RPC submit_form_by_token può accettare l'intero blob
--   · Lo staff vede tutto nella card senza JOIN aggiuntivi
-- ============================================================

-- 1. Colonna dati_form su enea_practices
ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS dati_form jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.enea_practices.dati_form IS
  'Dati estesi del form pubblico compilato dal cliente finale (richiedente, residenza, catastali, edificio, impianto, varianti prodotto). Schema: jsonb flessibile.';

-- 2. Aggiorno la view enea_practices_public per esporre dati_form
CREATE OR REPLACE VIEW public.enea_practices_public
WITH (security_invoker = true) AS
SELECT
  ep.id, ep.reseller_id, ep.current_stage_id, ep.brand,
  ep.cliente_nome, ep.cliente_cognome, ep.cliente_email, ep.cliente_telefono,
  ep.cliente_indirizzo, ep.cliente_cf, ep.prodotto_installato, ep.fornitore, ep.note,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.note_interne ELSE NULL END AS note_interne,
  ep.fatture_urls, ep.documenti_enea_urls, ep.documenti_aggiuntivi_urls,
  ep.documenti_mancanti, ep.note_documenti_mancanti,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.guadagno_lordo ELSE NULL END AS guadagno_lordo,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.guadagno_netto ELSE NULL END AS guadagno_netto,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.note_gestionale ELSE NULL END AS note_gestionale,
  ep.data_invio_pratica, ep.operatore_id, ep.assigned_at,
  ep.ultimo_sollecito_privato, ep.conteggio_solleciti, ep.ultimo_sollecito_fornitore,
  ep.form_compilato_at,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.form_token
       WHEN ep.reseller_id = public.get_reseller_company_id(auth.uid()) THEN ep.form_token
       ELSE NULL END AS form_token,
  ep.recensione_richiesta_at, ep.recensione_ricevuta_at, ep.recensione_testo, ep.recensione_stelle,
  ep.archived_at, ep.created_at, ep.updated_at, ep.pratica_enea_conclusa_urls,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.tipo_fatturazione ELSE NULL END AS tipo_fatturazione,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.tipo_servizio ELSE NULL END AS tipo_servizio,
  ep.tipo_soggetto, ep.archivio_path,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.prezzo ELSE NULL END AS prezzo,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.pagamento_stato ELSE NULL END AS pagamento_stato,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.data_incasso ELSE NULL END AS data_incasso,
  -- dati_form: visibile solo a staff e al reseller proprietario (per inoltrare al cliente se serve)
  CASE
    WHEN public.is_internal(auth.uid()) THEN ep.dati_form
    WHEN ep.reseller_id = public.get_reseller_company_id(auth.uid()) THEN ep.dati_form
    ELSE '{}'::jsonb
  END AS dati_form
FROM public.enea_practices ep;

GRANT SELECT ON public.enea_practices_public TO authenticated;

-- 3. Aggiorno get_practice_by_form_token per esporre dati_form al cliente finale anonimo
-- (il cliente deve POTER vedere quello che ha già compilato in caso ricarichi il form)
CREATE OR REPLACE FUNCTION public.get_practice_by_form_token(p_token text)
RETURNS TABLE (
  id uuid,
  brand text,
  current_stage_id uuid,
  cliente_nome text,
  cliente_cognome text,
  cliente_email text,
  cliente_telefono text,
  cliente_indirizzo text,
  cliente_cf text,
  note text,
  form_compilato_at timestamptz,
  archived_at timestamptz,
  reseller_id uuid,
  reseller_name text,
  prodotto_installato text,
  dati_form jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    ep.id,
    ep.brand::text,
    ep.current_stage_id,
    ep.cliente_nome,
    ep.cliente_cognome,
    ep.cliente_email,
    ep.cliente_telefono,
    ep.cliente_indirizzo,
    ep.cliente_cf,
    ep.note,
    ep.form_compilato_at,
    ep.archived_at,
    ep.reseller_id,
    c.ragione_sociale,
    ep.prodotto_installato,
    COALESCE(ep.dati_form, '{}'::jsonb)
  FROM public.enea_practices ep
  LEFT JOIN public.companies c ON c.id = ep.reseller_id
  WHERE ep.form_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_practice_by_form_token(text) TO anon, authenticated;

-- 4. Estendo submit_form_by_token per accettare il blob dati_form
-- Manteniamo retrocompatibilità: tutti i parametri esistenti restano,
-- aggiungo p_dati_form jsonb come parametro opzionale (default '{}')
CREATE OR REPLACE FUNCTION public.submit_form_by_token(
  p_token text,
  p_cliente_nome text,
  p_cliente_cognome text,
  p_cliente_email text,
  p_cliente_telefono text,
  p_cliente_indirizzo text,
  p_cliente_cf text,
  p_note text,
  p_dati_form jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_practice_id uuid;
  v_brand text;
  v_stage_id uuid;
BEGIN
  SELECT id, brand::text INTO v_practice_id, v_brand
  FROM public.enea_practices
  WHERE form_token = p_token
    AND archived_at IS NULL
    AND form_compilato_at IS NULL
  LIMIT 1;

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'Pratica non trovata, archiviata o già compilata'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_stage_id
  FROM public.pipeline_stages
  WHERE reseller_id IS NULL
    AND stage_type = 'pronte_da_fare'
    AND brand = v_brand
  LIMIT 1;

  UPDATE public.enea_practices
  SET
    cliente_nome = COALESCE(NULLIF(p_cliente_nome, ''), cliente_nome),
    cliente_cognome = COALESCE(NULLIF(p_cliente_cognome, ''), cliente_cognome),
    cliente_email = NULLIF(p_cliente_email, ''),
    cliente_telefono = NULLIF(p_cliente_telefono, ''),
    cliente_indirizzo = NULLIF(p_cliente_indirizzo, ''),
    cliente_cf = NULLIF(p_cliente_cf, ''),
    note = NULLIF(p_note, ''),
    dati_form = COALESCE(p_dati_form, '{}'::jsonb),
    form_compilato_at = now(),
    current_stage_id = COALESCE(v_stage_id, current_stage_id)
  WHERE id = v_practice_id;

  RETURN v_practice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_form_by_token(text, text, text, text, text, text, text, text, jsonb) TO anon, authenticated;

-- 5. RPC per salvataggio progressivo (autosave) del form
-- Permette al cliente di salvare bozza senza chiudere la pratica
CREATE OR REPLACE FUNCTION public.save_form_draft_by_token(
  p_token text,
  p_dati_form jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_practice_id uuid;
BEGIN
  SELECT id INTO v_practice_id
  FROM public.enea_practices
  WHERE form_token = p_token
    AND archived_at IS NULL
    AND form_compilato_at IS NULL
  LIMIT 1;

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'Pratica non trovata o già compilata'
      USING ERRCODE = 'P0002';
  END IF;

  -- Salva il blob senza spostare lo stage né segnare form_compilato_at
  UPDATE public.enea_practices
  SET dati_form = COALESCE(p_dati_form, dati_form, '{}'::jsonb),
      updated_at = now()
  WHERE id = v_practice_id;

  RETURN v_practice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_form_draft_by_token(text, jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.save_form_draft_by_token(text, jsonb) IS
  'Autosave del form pubblico — aggiorna solo dati_form senza marcare form_compilato_at. Permette al cliente di interrompere e riprendere senza perdere dati.';
