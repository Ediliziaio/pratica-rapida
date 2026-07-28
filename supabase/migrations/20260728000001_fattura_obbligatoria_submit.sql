-- Rende la fattura OBBLIGATORIA lato server per il form cliente classico.
-- Problema: submit_form_by_token accettava l'invio anche senza fattura;
-- l'obbligo esisteva solo lato browser (aggirabile). Alcuni clienti
-- inviavano il modulo senza allegare la fattura.
--
-- Scelta di scoping (per non rompere altri flussi):
--   · Il controllo scatta SOLO se il blob dati_form contiene la sezione
--     "documenti" (cioè il form cliente classico che raccoglie la fattura).
--   · I moduli dinamici (schema DB, senza sezione documenti) restano esenti.
--   · È ammesso l'invio se la pratica ha già una fattura in fatture_urls
--     (percorso rivenditore).
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
