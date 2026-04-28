-- ============================================================
-- Fix Bug B — Sync bidirezionale pratiche.stato ↔ enea_practices.current_stage_id
--
-- Problema: pratiche legacy e enea_practices condividono lo stesso UUID ma
-- gli stati erano desynced. Lo screenshot dell'utente conferma:
--   - Giovanni Solinas: pratiche=in_lavorazione, enea=pronte_da_fare
--   - samuele beretta: pratiche=in_lavorazione, enea=recensione
--   - b n: pratiche=in_lavorazione, enea=pronte_da_fare
--
-- Quando un operatore sposta una card nel kanban (enea_practices.current_stage_id),
-- la pagina /pratiche/:id (che legge pratiche.stato) mostra ancora lo stato vecchio.
--
-- Fix: 2 trigger DB che sincronizzano in entrambe le direzioni con mapping
-- enum pratica_stato ↔ pipeline_stages.stage_type
-- ============================================================

-- 1. Trigger ENEA → LEGACY: quando current_stage_id cambia, aggiorna pratiche.stato
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

  -- Mapping pipeline_stages.stage_type → pratica_stato enum
  v_new_stato := CASE v_stage_type
    WHEN 'inviata'              THEN 'inviata'::pratica_stato
    WHEN 'attesa_compilazione'  THEN 'inviata'::pratica_stato
    WHEN 'pronte_da_fare'       THEN 'in_lavorazione'::pratica_stato
    WHEN 'documenti_mancanti'   THEN 'in_attesa_documenti'::pratica_stato
    WHEN 'da_inviare'           THEN 'in_lavorazione'::pratica_stato
    WHEN 'gestionale'           THEN 'in_lavorazione'::pratica_stato
    WHEN 'recensione'           THEN 'in_lavorazione'::pratica_stato
    WHEN 'archiviate'           THEN 'completata'::pratica_stato
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

DROP TRIGGER IF EXISTS sync_enea_to_pratiche_trigger ON public.enea_practices;
CREATE TRIGGER sync_enea_to_pratiche_trigger
  AFTER UPDATE OF current_stage_id ON public.enea_practices
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_enea_to_pratiche_stato();

-- 2. Trigger LEGACY → ENEA: quando pratiche.stato cambia, aggiorna current_stage_id
CREATE OR REPLACE FUNCTION public.sync_pratiche_to_enea_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_target_stage_type text;
  v_new_stage_id uuid;
  v_brand text;
BEGIN
  IF NEW.stato IS NOT DISTINCT FROM OLD.stato THEN
    RETURN NEW;
  END IF;

  -- Brand della pratica (default 'enea' se mancante)
  SELECT COALESCE(brand::text, 'enea') INTO v_brand
  FROM public.enea_practices WHERE id = NEW.id;
  IF v_brand IS NULL THEN v_brand := 'enea'; END IF;

  -- Mapping pratica_stato → stage_type (priorità: minimum disruption)
  v_target_stage_type := CASE NEW.stato::text
    WHEN 'bozza'                THEN 'inviata'
    WHEN 'inviata'              THEN 'inviata'
    WHEN 'in_lavorazione'       THEN 'pronte_da_fare'
    WHEN 'in_attesa_documenti'  THEN 'documenti_mancanti'
    WHEN 'completata'           THEN 'archiviate'
    WHEN 'annullata'            THEN 'archiviate'
    ELSE NULL
  END;

  IF v_target_stage_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_new_stage_id
  FROM public.pipeline_stages
  WHERE reseller_id IS NULL
    AND stage_type::text = v_target_stage_type
    AND brand = v_brand
  LIMIT 1;

  IF v_new_stage_id IS NOT NULL THEN
    UPDATE public.enea_practices
    SET current_stage_id = v_new_stage_id,
        updated_at = NOW()
    WHERE id = NEW.id
      AND (current_stage_id IS NULL OR current_stage_id != v_new_stage_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_pratiche_to_enea_trigger ON public.pratiche;
CREATE TRIGGER sync_pratiche_to_enea_trigger
  AFTER UPDATE OF stato ON public.pratiche
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_pratiche_to_enea_stage();

-- 3. Backfill desync attuale (one-shot): pratiche.stato → enea_practices.current_stage_id
-- (Non sovrascriviamo enea_practices se già più aggiornato — usiamo ENEA come autoritativa
-- perché è quella che gli operatori usano oggi)
UPDATE public.pratiche p
SET stato = (
  CASE (
    SELECT ps.stage_type::text
    FROM public.enea_practices ep
    JOIN public.pipeline_stages ps ON ps.id = ep.current_stage_id
    WHERE ep.id = p.id
  )
    WHEN 'inviata'              THEN 'inviata'::pratica_stato
    WHEN 'attesa_compilazione'  THEN 'inviata'::pratica_stato
    WHEN 'pronte_da_fare'       THEN 'in_lavorazione'::pratica_stato
    WHEN 'documenti_mancanti'   THEN 'in_attesa_documenti'::pratica_stato
    WHEN 'da_inviare'           THEN 'in_lavorazione'::pratica_stato
    WHEN 'gestionale'           THEN 'in_lavorazione'::pratica_stato
    WHEN 'recensione'           THEN 'in_lavorazione'::pratica_stato
    WHEN 'archiviate'           THEN 'completata'::pratica_stato
    ELSE p.stato
  END
)
WHERE EXISTS (
  SELECT 1 FROM public.enea_practices ep
  WHERE ep.id = p.id AND ep.current_stage_id IS NOT NULL
);
