-- Il primo click su "Apri form online" crea una riga tecnica per conservare
-- token e allegati. Non e' ancora una pratica ricevuta: il rivenditore puo'
-- chiudere la pagina senza avere compilato o inviato il modulo.
--
-- La bozza resta accessibile al rivenditore che deve completarla e alle RPC
-- tokenizzate, ma viene nascosta esclusivamente agli utenti interni del CRM.
-- submit_form_by_token sostituisce dati_form con i dati completi del modulo:
-- il marker scompare e la pratica diventa visibile nello stesso aggiornamento
-- atomico che valorizza form_compilato_at e la porta in pronte_da_fare.

UPDATE public.enea_practices AS practice
SET dati_form = COALESCE(practice.dati_form, '{}'::jsonb) || jsonb_build_object(
  'workflow',
  COALESCE(practice.dati_form->'workflow', '{}'::jsonb) ||
    jsonb_build_object('reseller_form_draft', true)
)
FROM public.pipeline_stages AS stage
WHERE practice.current_stage_id = stage.id
  AND stage.stage_type = 'attesa_compilazione'
  AND practice.tipo_servizio IN ('documenti_forniti', 'pratica_only')
  AND practice.form_compilato_at IS NULL;

-- L'autosalvataggio del form sostituisce dati_form. Senza questa protezione il
-- primo campo digitato cancellerebbe il marker e farebbe riapparire la bozza
-- nel CRM prima dell'invio. Il ramo si attiva soltanto sulle righe marcate;
-- tutti gli altri form mantengono esattamente il comportamento precedente.
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
  v_existing_data jsonb;
  v_next_data jsonb;
BEGIN
  SELECT id, dati_form
  INTO v_practice_id, v_existing_data
  FROM public.enea_practices
  WHERE form_token = p_token
    AND archived_at IS NULL
    AND form_compilato_at IS NULL
  LIMIT 1;

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'Pratica non trovata o già compilata'
      USING ERRCODE = 'P0002';
  END IF;

  v_next_data := COALESCE(p_dati_form, v_existing_data, '{}'::jsonb);
  IF COALESCE(v_existing_data #>> '{workflow,reseller_form_draft}', 'false') = 'true' THEN
    v_next_data := v_next_data || jsonb_build_object(
      'workflow',
      COALESCE(v_next_data->'workflow', '{}'::jsonb) ||
        jsonb_build_object('reseller_form_draft', true)
    );
  END IF;

  UPDATE public.enea_practices
  SET dati_form = v_next_data,
      updated_at = now()
  WHERE id = v_practice_id;

  RETURN v_practice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_form_draft_by_token(text, jsonb)
  TO anon, authenticated;

DROP POLICY IF EXISTS "Internal CRM hides incomplete reseller online drafts"
  ON public.enea_practices;
CREATE POLICY "Internal CRM hides incomplete reseller online drafts"
  ON public.enea_practices
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public.is_internal(auth.uid())
    OR COALESCE(dati_form #>> '{workflow,reseller_form_draft}', 'false') <> 'true'
  );

-- Le notifiche create quando la bozza tecnica era stata scambiata per una
-- richiesta ricevuta puntano a righe che ora il CRM non deve mostrare.
DELETE FROM public.notifications AS notification
USING public.enea_practices AS practice
WHERE COALESCE(practice.dati_form #>> '{workflow,reseller_form_draft}', 'false') = 'true'
  AND notification.tipo = 'richiesta_pubblica'
  AND notification.link = '/pratiche/' || practice.id::text;
