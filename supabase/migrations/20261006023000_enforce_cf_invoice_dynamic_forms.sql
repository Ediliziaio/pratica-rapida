-- Garanzia fattura nei form pubblici:
--   * CF e pratiche legacy non classificate: la fattura deve essere presente,
--     anche quando il modulo dinamico la salva fuori da documenti.fattura_url;
--   * rivenditore: nessun controllo fattura sul form cliente, perché il
--     documento è già raccolto a monte dal form del rivenditore.
--
-- La funzione mantiene invariati pagamento, dati catastali e spostamento stage.
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
  v_tipo_fatturazione text;
  v_pagamento_stato public.pagamento_stato;
  v_stage_id uuid;
  v_has_fatture_urls boolean;
  v_has_form_invoice boolean;
  v_recupero_catastale boolean;
  v_rollout_enabled boolean;
  v_payment_required boolean;
BEGIN
  SELECT id, brand::text, tipo_fatturazione, pagamento_stato
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

  -- Allineato alla UI: soltanto il valore certificato "rivenditore" esenta
  -- dalla fattura. I record legacy NULL restano in fail-safe.
  IF v_tipo_fatturazione IS DISTINCT FROM 'rivenditore' THEN
    SELECT COALESCE(array_length(fatture_urls, 1), 0) > 0
      INTO v_has_fatture_urls
    FROM public.enea_practices
    WHERE id = v_practice_id;

    -- I moduli dinamici salvano {step: {campo: valore}}. Cerchiamo soltanto
    -- le chiavi upload fattura riconosciute dalla policy frontend, a qualunque
    -- step appartengano, senza confondere campi descrittivi come
    -- "fattura_riporta_mq".
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_each(COALESCE(p_dati_form, '{}'::jsonb)) AS section_entry
      CROSS JOIN LATERAL jsonb_each(
        CASE
          WHEN jsonb_typeof(section_entry.value) = 'object' THEN section_entry.value
          ELSE '{}'::jsonb
        END
      ) AS field_entry
      WHERE lower(field_entry.key) IN (
        'fattura',
        'fattura_url',
        'fattura_installatore',
        'fattura_lavori'
      )
        AND CASE
          WHEN jsonb_typeof(field_entry.value) = 'string'
            THEN btrim(field_entry.value #>> '{}') <> ''
          WHEN jsonb_typeof(field_entry.value) = 'array'
            THEN jsonb_array_length(field_entry.value) > 0
          ELSE false
        END
    ) INTO v_has_form_invoice;

    IF NOT COALESCE(v_has_fatture_urls, false)
       AND NOT COALESCE(v_has_form_invoice, false)
    THEN
      RAISE EXCEPTION 'Fattura obbligatoria: carica la fattura prima di inviare il modulo'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_recupero_catastale := lower(COALESCE(p_dati_form->'catastali'->>'recupero_richiesto', 'false'))
    IN ('true', '1', 'si', 'sì', 'yes');
  SELECT COALESCE((value->>'enabled')::boolean, false)
    INTO v_rollout_enabled
  FROM public.platform_settings
  WHERE key = 'fic_tspay_rollout';
  v_rollout_enabled := COALESCE(v_rollout_enabled, false);
  v_payment_required := v_tipo_fatturazione = 'cliente_finale'
    OR (v_rollout_enabled AND v_recupero_catastale);

  IF NOT v_recupero_catastale AND (
    COALESCE(trim(p_dati_form->'catastali'->>'foglio'), '') = '' OR
    COALESCE(trim(p_dati_form->'catastali'->>'mappale'), '') = ''
  ) THEN
    RAISE EXCEPTION 'Dati catastali obbligatori: inserisci foglio e mappale oppure richiedi il servizio di ricerca'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_recupero_catastale AND (
    COALESCE(trim(p_dati_form->'catastali'->>'proprietario_nome'), '') = '' OR
    COALESCE(trim(p_dati_form->'catastali'->>'proprietario_cognome'), '') = '' OR
    COALESCE(trim(p_dati_form->'catastali'->>'proprietario_cf'), '') = ''
  ) THEN
    RAISE EXCEPTION 'Per la ricerca catastale servono nome, cognome e codice fiscale del proprietario'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_payment_required OR v_pagamento_stato = 'pagata' THEN
    SELECT id INTO v_stage_id
    FROM public.pipeline_stages
    WHERE reseller_id IS NULL
      AND stage_type = 'pronte_da_fare'
      AND brand = v_brand
    LIMIT 1;
  END IF;

  UPDATE public.enea_practices
  SET
    cliente_nome = COALESCE(NULLIF(p_cliente_nome, ''), cliente_nome),
    cliente_cognome = COALESCE(NULLIF(p_cliente_cognome, ''), cliente_cognome),
    cliente_email = NULLIF(p_cliente_email, ''),
    cliente_telefono = NULLIF(p_cliente_telefono, ''),
    cliente_indirizzo = NULLIF(p_cliente_indirizzo, ''),
    cliente_cf = NULLIF(upper(p_cliente_cf), ''),
    note = NULLIF(p_note, ''),
    dati_form = COALESCE(p_dati_form, '{}'::jsonb),
    form_compilato_at = now(),
    current_stage_id = CASE
      WHEN v_payment_required AND v_pagamento_stato IS DISTINCT FROM 'pagata'::public.pagamento_stato THEN current_stage_id
      ELSE COALESCE(v_stage_id, current_stage_id)
    END,
    pagamento_stato = CASE
      WHEN v_payment_required AND v_pagamento_stato IS DISTINCT FROM 'pagata'::public.pagamento_stato THEN 'non_pagata'::public.pagamento_stato
      ELSE pagamento_stato
    END
  WHERE id = v_practice_id;

  RETURN v_practice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_form_by_token(text, text, text, text, text, text, text, text, jsonb) TO anon, authenticated;
