-- Crea la bozza tecnica del percorso "Documenti forniti / form online"
-- senza esporla alle SELECT del CRM interno.
--
-- La policy restrittiva che nasconde queste bozze e' corretta, ma rende
-- impossibile usare INSERT ... RETURNING dal browser: PostgREST applica la
-- policy SELECT anche alla riga restituita e annulla l'intera operazione.
-- Questa RPC restituisce al solo chiamante ID e token necessari a completare
-- il form, mantenendo invariata la policy che nasconde la bozza nel CRM.

CREATE OR REPLACE FUNCTION public.create_enea_reseller_online_draft(
  p_reseller_id uuid,
  p_current_stage_id uuid,
  p_tipo_servizio text,
  p_invia_pratica_al_cliente boolean,
  p_tipo_fatturazione text,
  p_tipo_soggetto text,
  p_prodotto_installato text,
  p_cliente_nome text,
  p_cliente_cognome text,
  p_cliente_email text,
  p_cliente_telefono text,
  p_cliente_cf text,
  p_cliente_indirizzo text,
  p_data_fine_lavori date,
  p_dati_form jsonb,
  p_prezzo numeric,
  p_note text,
  p_contratto_versione text
)
RETURNS TABLE (
  id uuid,
  form_token text,
  dati_form jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_internal(v_user_id)
     AND p_reseller_id IS DISTINCT FROM public.get_reseller_company_id(v_user_id) THEN
    RAISE EXCEPTION 'Azienda non autorizzata' USING ERRCODE = '42501';
  END IF;

  IF p_tipo_servizio NOT IN ('pratica_only', 'documenti_forniti')
     OR COALESCE(p_dati_form #>> '{workflow,reseller_form_draft}', 'false') <> 'true' THEN
    RAISE EXCEPTION 'La funzione accetta soltanto bozze Documenti forniti / form online'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pipeline_stages AS stage
    WHERE stage.id = p_current_stage_id
      AND stage.brand = 'enea'
      AND stage.stage_type = 'attesa_compilazione'
  ) THEN
    RAISE EXCEPTION 'Stage iniziale non valido per la bozza online'
      USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(p_cliente_nome), '') IS NULL
     OR NULLIF(btrim(p_cliente_cognome), '') IS NULL
     OR NULLIF(btrim(p_cliente_telefono), '') IS NULL THEN
    RAISE EXCEPTION 'Dati cliente obbligatori mancanti' USING ERRCODE = '23502';
  END IF;

  RETURN QUERY
  INSERT INTO public.enea_practices (
    reseller_id,
    brand,
    current_stage_id,
    tipo_servizio,
    invia_pratica_al_cliente,
    tipo_fatturazione,
    pagamento_stato,
    tipo_soggetto,
    prodotto_installato,
    cliente_nome,
    cliente_cognome,
    cliente_email,
    cliente_telefono,
    cliente_cf,
    cliente_indirizzo,
    data_fine_lavori,
    dati_form,
    prezzo,
    note,
    contratto_accettato_at,
    contratto_versione,
    fatture_urls,
    documenti_enea_urls,
    documenti_aggiuntivi_urls,
    documenti_mancanti
  ) VALUES (
    p_reseller_id,
    'enea',
    p_current_stage_id,
    p_tipo_servizio,
    COALESCE(p_invia_pratica_al_cliente, false),
    p_tipo_fatturazione,
    'non_pagata',
    p_tipo_soggetto,
    p_prodotto_installato,
    btrim(p_cliente_nome),
    btrim(p_cliente_cognome),
    NULLIF(btrim(p_cliente_email), ''),
    btrim(p_cliente_telefono),
    NULLIF(btrim(p_cliente_cf), ''),
    NULLIF(btrim(p_cliente_indirizzo), ''),
    p_data_fine_lavori,
    p_dati_form,
    COALESCE(p_prezzo, 0),
    NULLIF(btrim(p_note), ''),
    now(),
    p_contratto_versione,
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    '{}'::text[]
  )
  RETURNING
    enea_practices.id,
    enea_practices.form_token,
    enea_practices.dati_form;
END;
$$;

REVOKE ALL ON FUNCTION public.create_enea_reseller_online_draft(
  uuid, uuid, text, boolean, text, text, text, text, text, text, text, text,
  text, date, jsonb, numeric, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_enea_reseller_online_draft(
  uuid, uuid, text, boolean, text, text, text, text, text, text, text, text,
  text, date, jsonb, numeric, text, text
) TO authenticated;

COMMENT ON FUNCTION public.create_enea_reseller_online_draft(
  uuid, uuid, text, boolean, text, text, text, text, text, text, text, text,
  text, date, jsonb, numeric, text, text
) IS
  'Crea una bozza tecnica Documenti forniti/form online e restituisce ID e token senza renderla visibile nel CRM interno.';
