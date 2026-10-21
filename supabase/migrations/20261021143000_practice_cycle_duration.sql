-- Durata stabile del ciclo operativo della pratica.
-- Parte da created_at e si congela al PRIMO ingresso nello stage
-- "Invio pratica chiusa" (stage_type = da_inviare).

ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS ciclo_chiuso_at timestamptz;

COMMENT ON COLUMN public.enea_practices.ciclo_chiuso_at IS
  'Primo ingresso in Invio pratica chiusa. Immutabile: termine del contatore di lavorazione iniziato a created_at.';

CREATE OR REPLACE FUNCTION public.freeze_practice_cycle_on_closed_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_stage_type text;
  v_check_stage boolean := false;
BEGIN
  -- Una volta registrata, la chiusura non cambia nemmeno se la pratica viene
  -- spostata in Gestionale, Recensione, Archiviate o riportata indietro.
  IF TG_OP = 'UPDATE' AND OLD.ciclo_chiuso_at IS NOT NULL THEN
    NEW.ciclo_chiuso_at := OLD.ciclo_chiuso_at;
    RETURN NEW;
  END IF;

  -- Impedisce scritture manuali del timestamp: la sola fonte valida e lo
  -- spostamento reale della pratica nello stage da_inviare.
  NEW.ciclo_chiuso_at := NULL;

  IF TG_OP = 'INSERT' THEN
    v_check_stage := true;
  ELSIF NEW.current_stage_id IS DISTINCT FROM OLD.current_stage_id THEN
    v_check_stage := true;
  END IF;

  IF v_check_stage THEN
    SELECT stage_type::text
      INTO v_stage_type
      FROM public.pipeline_stages
     WHERE id = NEW.current_stage_id;

    IF v_stage_type = 'da_inviare' THEN
      NEW.ciclo_chiuso_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Per le pratiche storiche non esiste uno storico completo dei passaggi.
-- Se sono ancora in da_inviare, current_stage_entered_at e la data esatta.
-- Per gli stage successivi usiamo la consegna al cliente, oppure l'ingresso
-- nello stage corrente come ultima approssimazione disponibile. Da questa
-- migrazione in avanti ogni nuova chiusura viene invece registrata esattamente.
UPDATE public.enea_practices ep
   SET ciclo_chiuso_at = GREATEST(
     ep.created_at,
     CASE
       WHEN ps.stage_type = 'da_inviare' THEN ep.current_stage_entered_at
       ELSE COALESCE(ep.data_invio_pratica::timestamptz, ep.current_stage_entered_at)
     END
   )
  FROM public.pipeline_stages ps
 WHERE ps.id = ep.current_stage_id
   AND ps.stage_type IN ('da_inviare', 'gestionale', 'recensione', 'archiviate')
   AND ep.ciclo_chiuso_at IS NULL;

-- Il trigger viene attivato soltanto DOPO il backfill, cosi la protezione
-- contro le scritture manuali non annulla il recupero dei dati storici.
DROP TRIGGER IF EXISTS trg_enea_practices_freeze_cycle ON public.enea_practices;
CREATE TRIGGER trg_enea_practices_freeze_cycle
  BEFORE INSERT OR UPDATE ON public.enea_practices
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_practice_cycle_on_closed_stage();

CREATE INDEX IF NOT EXISTS idx_enea_practices_ciclo_chiuso_at
  ON public.enea_practices(ciclo_chiuso_at)
  WHERE ciclo_chiuso_at IS NOT NULL;

-- Mantiene la view usata dal Kanban e aggiunge in coda il timestamp del ciclo.
CREATE OR REPLACE VIEW public.enea_practices_public
WITH (security_invoker = true) AS
SELECT id,
    reseller_id,
    current_stage_id,
    brand,
    cliente_nome,
    cliente_cognome,
    cliente_email,
    cliente_telefono,
    cliente_indirizzo,
    cliente_cf,
    prodotto_installato,
    fornitore,
    note,
        CASE WHEN is_internal(auth.uid()) THEN note_interne ELSE NULL::text END AS note_interne,
    fatture_urls,
    documenti_enea_urls,
    documenti_aggiuntivi_urls,
    documenti_mancanti,
    note_documenti_mancanti,
        CASE WHEN is_internal(auth.uid()) THEN guadagno_lordo ELSE NULL::numeric END AS guadagno_lordo,
        CASE WHEN is_internal(auth.uid()) THEN guadagno_netto ELSE NULL::numeric END AS guadagno_netto,
        CASE WHEN is_internal(auth.uid()) THEN note_gestionale ELSE NULL::text END AS note_gestionale,
    data_invio_pratica,
    operatore_id,
    assigned_at,
    ultimo_sollecito_privato,
    conteggio_solleciti,
    ultimo_sollecito_fornitore,
    form_compilato_at,
        CASE
            WHEN is_internal(auth.uid()) THEN form_token
            WHEN reseller_id = get_reseller_company_id(auth.uid()) THEN form_token
            ELSE NULL::text
        END AS form_token,
    recensione_richiesta_at,
    recensione_ricevuta_at,
    recensione_testo,
    recensione_stelle,
    archived_at,
    created_at,
    updated_at,
    current_stage_entered_at,
    pratica_enea_conclusa_urls,
        CASE WHEN is_internal(auth.uid()) THEN tipo_fatturazione ELSE NULL::text END AS tipo_fatturazione,
        CASE WHEN is_internal(auth.uid()) THEN tipo_servizio ELSE NULL::text END AS tipo_servizio,
    tipo_soggetto,
    archivio_path,
        CASE WHEN is_internal(auth.uid()) THEN prezzo ELSE NULL::numeric END AS prezzo,
        CASE WHEN is_internal(auth.uid()) THEN pagamento_stato ELSE NULL::pagamento_stato END AS pagamento_stato,
        CASE WHEN is_internal(auth.uid()) THEN data_incasso ELSE NULL::timestamptz END AS data_incasso,
        CASE
            WHEN is_internal(auth.uid()) THEN dati_form
            WHEN reseller_id = get_reseller_company_id(auth.uid()) THEN dati_form
            ELSE '{}'::jsonb
        END AS dati_form,
        CASE WHEN is_internal(auth.uid()) THEN azienda_dichiarata ELSE NULL::text END AS azienda_dichiarata,
        CASE WHEN is_internal(auth.uid()) THEN chiamate_assegnato_a ELSE NULL::text END AS chiamate_assegnato_a,
    data_fine_lavori,
        CASE WHEN is_internal(auth.uid()) THEN canale ELSE NULL::text END AS canale,
        CASE WHEN is_internal(auth.uid()) THEN provenienza ELSE NULL::jsonb END AS provenienza,
    ciclo_chiuso_at
FROM public.enea_practices ep;

GRANT SELECT ON public.enea_practices_public TO authenticated;

NOTIFY pgrst, 'reload schema';
