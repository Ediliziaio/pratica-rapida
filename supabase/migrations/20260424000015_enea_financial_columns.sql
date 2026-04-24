-- ============================================================
-- Fase 2 Unificazione — Colonne finanziarie su enea_practices
--
-- Problema: enea_practices non aveva prezzo/pagamento_stato. Per
-- raggiungere parità con il Gestionale legacy (KPI fatturato/incassato
-- + toggle inline pagamento + export xlsx), servono queste colonne.
--
-- Strategia:
-- 1) Aggiunge colonne con valori default sensati
-- 2) Backfill dai dati di pratiche legacy (stesso UUID)
-- 3) Aggiorna la view enea_practices_public per esporli a staff
-- ============================================================

-- 1. Nuove colonne su enea_practices
ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS prezzo NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pagamento_stato public.pagamento_stato DEFAULT 'non_pagata',
  ADD COLUMN IF NOT EXISTS data_incasso TIMESTAMPTZ;

COMMENT ON COLUMN public.enea_practices.prezzo IS 'Prezzo pratica in EUR (fatturato dal rivenditore). 0 se pratica gratis / fatturazione cliente_finale';
COMMENT ON COLUMN public.enea_practices.pagamento_stato IS 'Stato pagamento: non_pagata | pagata | in_verifica | rimborsata';
COMMENT ON COLUMN public.enea_practices.data_incasso IS 'Timestamp incasso (quando pagamento_stato diventa pagata)';

-- 2. Backfill da pratiche legacy (stesso id) — non sovrascrive valori già impostati
UPDATE public.enea_practices ep
SET
  prezzo = COALESCE(p.prezzo, 0),
  pagamento_stato = COALESCE(p.pagamento_stato, ep.pagamento_stato)
FROM public.pratiche p
WHERE ep.id = p.id
  AND ep.prezzo = 0  -- solo righe non ancora valorizzate
  AND p.prezzo IS NOT NULL;

-- 3. Ricrea enea_practices_public includendo le nuove colonne
-- (le colonne finanziarie restano visibili solo a staff, come guadagno_*)
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
  ep.archived_at, ep.created_at, ep.updated_at, ep.pratica_enea_conclusa_urls,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.tipo_fatturazione ELSE NULL END AS tipo_fatturazione,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.tipo_servizio ELSE NULL END AS tipo_servizio,
  ep.tipo_soggetto, ep.archivio_path,
  -- Nuove colonne finanziarie (staff-only)
  CASE WHEN public.is_internal(auth.uid()) THEN ep.prezzo ELSE NULL END AS prezzo,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.pagamento_stato ELSE NULL END AS pagamento_stato,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.data_incasso ELSE NULL END AS data_incasso
FROM public.enea_practices ep;

GRANT SELECT ON public.enea_practices_public TO authenticated;
