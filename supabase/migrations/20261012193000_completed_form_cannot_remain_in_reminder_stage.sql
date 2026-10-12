-- Invariante operativo:
-- un modulo completato non puo restare nelle colonne usate per i solleciti
-- di compilazione quando non manca un pagamento obbligatorio.
--
-- I moduli completati ma ancora non pagati restano fermi: non sono lavorabili
-- e process-automations li esclude gia dai solleciti di compilazione tramite
-- form_compilato_at IS NULL. Appena il pagamento diventa "pagata", lo stesso
-- trigger li promuove a Pronte da fare.
CREATE OR REPLACE FUNCTION public.promote_completed_form_out_of_reminder_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_current_stage_type public.stage_type;
  v_ready_stage_id uuid;
  v_recupero_catastale boolean;
  v_rollout_enabled boolean;
  v_payment_required boolean;
BEGIN
  IF NEW.archived_at IS NOT NULL OR NEW.form_compilato_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT stage_type
    INTO v_current_stage_type
  FROM public.pipeline_stages
  WHERE id = NEW.current_stage_id;

  IF v_current_stage_type NOT IN ('inviata', 'attesa_compilazione') THEN
    RETURN NEW;
  END IF;

  v_recupero_catastale := lower(COALESCE(NEW.dati_form->'catastali'->>'recupero_richiesto', 'false'))
    IN ('true', '1', 'si', 'sì', 'yes');

  SELECT COALESCE((value->>'enabled')::boolean, false)
    INTO v_rollout_enabled
  FROM public.platform_settings
  WHERE key = 'fic_tspay_rollout';
  v_rollout_enabled := COALESCE(v_rollout_enabled, false);

  v_payment_required := NEW.tipo_fatturazione = 'cliente_finale'
    OR (v_rollout_enabled AND v_recupero_catastale);

  IF v_payment_required AND NEW.pagamento_stato IS DISTINCT FROM 'pagata'::public.pagamento_stato THEN
    RETURN NEW;
  END IF;

  SELECT id
    INTO v_ready_stage_id
  FROM public.pipeline_stages
  WHERE reseller_id IS NULL
    AND stage_type = 'pronte_da_fare'
    AND brand = NEW.brand
  LIMIT 1;

  IF v_ready_stage_id IS NULL THEN
    RAISE EXCEPTION 'Colonna Pronte da fare non configurata per il brand %', NEW.brand
      USING ERRCODE = 'P0001';
  END IF;

  NEW.current_stage_id := v_ready_stage_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promote_completed_form_out_of_reminder_stage ON public.enea_practices;
CREATE TRIGGER promote_completed_form_out_of_reminder_stage
BEFORE INSERT OR UPDATE OF
  current_stage_id,
  form_compilato_at,
  pagamento_stato,
  dati_form,
  tipo_fatturazione,
  archived_at
ON public.enea_practices
FOR EACH ROW
EXECUTE FUNCTION public.promote_completed_form_out_of_reminder_stage();

-- Riconcilia in modo idempotente eventuali righe che fossero entrate tra il
-- controllo e l'installazione della regola. L'assegnazione allo stesso valore
-- serve soltanto ad attraversare il trigger; le pratiche non idonee restano
-- invariate.
UPDATE public.enea_practices AS practice
SET current_stage_id = practice.current_stage_id
WHERE practice.archived_at IS NULL
  AND practice.form_compilato_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.pipeline_stages AS stage
    WHERE stage.id = practice.current_stage_id
      AND stage.stage_type IN ('inviata', 'attesa_compilazione')
  );

