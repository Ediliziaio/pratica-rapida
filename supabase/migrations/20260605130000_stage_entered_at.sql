-- =============================================
-- Track quando una pratica è entrata nello stage corrente.
-- Necessario per auto-archive affidabile: usare updated_at è fragile perché
-- cambia per ogni UPDATE (es. assegnazione operatore, nota aggiunta) e
-- resetterebbe il timer.
-- =============================================

ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS current_stage_entered_at TIMESTAMPTZ;

-- Backfill: per le pratiche esistenti usa updated_at come miglior approssimazione
UPDATE public.enea_practices
SET current_stage_entered_at = COALESCE(updated_at, created_at)
WHERE current_stage_entered_at IS NULL;

-- Set NOT NULL ora che è popolata
ALTER TABLE public.enea_practices
  ALTER COLUMN current_stage_entered_at SET NOT NULL,
  ALTER COLUMN current_stage_entered_at SET DEFAULT now();

-- Trigger: aggiorna il timestamp quando current_stage_id cambia
CREATE OR REPLACE FUNCTION public.set_stage_entered_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    NEW.current_stage_entered_at := COALESCE(NEW.current_stage_entered_at, now());
  ELSIF (TG_OP = 'UPDATE' AND NEW.current_stage_id IS DISTINCT FROM OLD.current_stage_id) THEN
    NEW.current_stage_entered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enea_practices_stage_entered_at ON public.enea_practices;
CREATE TRIGGER trg_enea_practices_stage_entered_at
  BEFORE INSERT OR UPDATE OF current_stage_id ON public.enea_practices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_stage_entered_at();

-- Indice per la query di auto-archive (stage_type=recensione, >10 giorni)
CREATE INDEX IF NOT EXISTS idx_enea_practices_stage_entered
  ON public.enea_practices(current_stage_id, current_stage_entered_at)
  WHERE archived_at IS NULL;

-- Aggiorna la view enea_practices_public per esporre la nuova colonna
-- (replica la definizione di 20260503000001_form_full_data.sql + 1 colonna)
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
  ep.archived_at, ep.created_at, ep.updated_at, ep.current_stage_entered_at,
  ep.pratica_enea_conclusa_urls,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.tipo_fatturazione ELSE NULL END AS tipo_fatturazione,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.tipo_servizio ELSE NULL END AS tipo_servizio,
  ep.tipo_soggetto, ep.archivio_path,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.prezzo ELSE NULL END AS prezzo,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.pagamento_stato ELSE NULL END AS pagamento_stato,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.data_incasso ELSE NULL END AS data_incasso,
  CASE
    WHEN public.is_internal(auth.uid()) THEN ep.dati_form
    WHEN ep.reseller_id = public.get_reseller_company_id(auth.uid()) THEN ep.dati_form
    ELSE '{}'::jsonb
  END AS dati_form
FROM public.enea_practices ep;

GRANT SELECT ON public.enea_practices_public TO authenticated;
