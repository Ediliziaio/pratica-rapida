-- Blocca l'invio del form cliente per le pratiche "a carico del cliente
-- finale" non ancora pagate.
--
-- Il buco: /paga/:token e /form/:token usano lo STESSO form_token, quindi al
-- cliente che riceve il link di pagamento basta cambiare /paga/ in /form/
-- nell'URL per compilare il modulo senza pagare. Il frontend ora reindirizza
-- alla pagina di pagamento, ma il gate vero deve stare qui: l'URL si
-- manipola, la funzione no.
--
-- Il salvataggio BOZZA (save_form_draft_by_token) resta libero: bloccare
-- solo l'invio finale non fa perdere dati a nessuno.
--
-- Corpo identico a 20260728000001 (fattura obbligatoria) + la guardia
-- pagamento subito dopo il lookup.
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
  v_has_fatture_urls boolean;
  v_tipo_fatturazione text;
  v_pagamento_stato text;
BEGIN
  SELECT id, brand::text, tipo_fatturazione::text, pagamento_stato::text
    INTO v_practice_id, v_brand, v_tipo_fatturazione, v_pagamento_stato
  FROM public.enea_practices
  WHERE form_token = p_token
    AND archived_at IS NULL
    AND form_compilato_at IS NULL
  LIMIT 1;

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'Pratica non trovata, archiviata o già compilata'
      USING ERRCODE = 'P0002';
  END IF;

  -- Servizio a carico del cliente finale: prima il pagamento, poi l'invio.
  IF v_tipo_fatturazione = 'cliente_finale'
     AND COALESCE(v_pagamento_stato, 'non_pagata') <> 'pagata'
  THEN
    RAISE EXCEPTION 'Per questa pratica serve prima il pagamento del servizio: apri il link di pagamento che hai ricevuto via email'
      USING ERRCODE = 'P0001';
  END IF;

  -- Obbligo fattura (solo form cliente classico con sezione "documenti").
  IF (p_dati_form ? 'documenti')
     AND COALESCE(p_dati_form->'documenti'->>'fattura_url', '') = ''
  THEN
    SELECT COALESCE(array_length(fatture_urls, 1), 0) > 0
      INTO v_has_fatture_urls
    FROM public.enea_practices
    WHERE id = v_practice_id;

    IF NOT COALESCE(v_has_fatture_urls, false) THEN
      RAISE EXCEPTION 'Fattura obbligatoria: carica la fattura prima di inviare il modulo'
        USING ERRCODE = 'P0001';
    END IF;
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
