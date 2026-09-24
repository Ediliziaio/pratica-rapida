-- ============================================================
-- Switch di produzione 24/09/2026 — PARTE 2 di 2 (dopo la PARTE 1)
--
-- 1. La riga della colonna, subito dopo "Pronte da fare", per ogni pipeline
--    globale che ce l'ha: in produzione sono due, `enea` e `conto_termico`.
--    Gli stage successivi scalano di uno. Idempotente.
-- 2. Il trigger di sincronizzazione: senza aggiungere il caso nuovo, una pratica
--    in "Richiesto intervento operatore" finirebbe nel ramo ELSE NULL e terrebbe
--    lo stato vecchio, in silenzio.
-- ============================================================

DO $$
DECLARE
  r RECORD;
  v_ordine INTEGER;
BEGIN
  FOR r IN
    SELECT DISTINCT brand
    FROM public.pipeline_stages
    WHERE reseller_id IS NULL AND stage_type = 'pronte_da_fare'
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.pipeline_stages
      WHERE reseller_id IS NULL AND brand = r.brand AND stage_type = 'intervento_operatore'
    ) THEN
      CONTINUE;
    END IF;

    SELECT order_index INTO v_ordine
    FROM public.pipeline_stages
    WHERE reseller_id IS NULL AND brand = r.brand AND stage_type = 'pronte_da_fare';

    UPDATE public.pipeline_stages
    SET order_index = order_index + 1
    WHERE reseller_id IS NULL AND brand = r.brand AND order_index > v_ordine;

    INSERT INTO public.pipeline_stages (reseller_id, name, stage_type, order_index, color, brand, is_visible)
    VALUES (NULL, 'Richiesto intervento operatore', 'intervento_operatore', v_ordine + 1, '#f59e0b', r.brand, TRUE);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sync_enea_to_pratiche_stato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_stage_type text;
  v_new_stato pratica_stato;
BEGIN
  IF NEW.current_stage_id IS NULL OR NEW.current_stage_id IS NOT DISTINCT FROM OLD.current_stage_id THEN
    RETURN NEW;
  END IF;

  SELECT stage_type::text INTO v_stage_type
  FROM public.pipeline_stages
  WHERE id = NEW.current_stage_id;

  v_new_stato := CASE v_stage_type
    WHEN 'inviata'               THEN 'inviata'::pratica_stato
    WHEN 'attesa_compilazione'   THEN 'inviata'::pratica_stato
    WHEN 'pronte_da_fare'        THEN 'in_lavorazione'::pratica_stato
    WHEN 'intervento_operatore'  THEN 'in_lavorazione'::pratica_stato
    WHEN 'documenti_mancanti'    THEN 'in_attesa_documenti'::pratica_stato
    WHEN 'da_inviare'            THEN 'in_lavorazione'::pratica_stato
    WHEN 'gestionale'            THEN 'in_lavorazione'::pratica_stato
    WHEN 'recensione'            THEN 'in_lavorazione'::pratica_stato
    WHEN 'archiviate'            THEN 'completata'::pratica_stato
    ELSE NULL
  END;

  IF v_new_stato IS NOT NULL THEN
    UPDATE public.pratiche
    SET stato = v_new_stato,
        updated_at = NOW()
    WHERE id = NEW.id
      AND stato IS DISTINCT FROM v_new_stato;
  END IF;

  RETURN NEW;
END;
$$;
