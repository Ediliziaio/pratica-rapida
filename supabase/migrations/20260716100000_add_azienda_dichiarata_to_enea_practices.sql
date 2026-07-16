-- Aggiunge azienda_dichiarata a enea_practices.
--
-- Le richieste dal sito di un'azienda non ancora in anagrafica finiscono sulla
-- company segnaposto "⚠️ Da abbinare — richieste sito". Finora la ragione
-- sociale dichiarata dal rivenditore viveva solo dentro il testo di `note`,
-- quindi i messaggi al cliente finale ("*{{2}}* ci ha incaricato di gestire la
-- pratica") mostravano il nome del segnaposto invece dell'azienda reale.
-- Questa colonna conserva il dato dichiarato in forma strutturata: i template
-- lo usano come nome da mostrare al cliente, il CRM lo affianca al badge
-- "Da abbinare" per il super_admin.
ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS azienda_dichiarata text;

COMMENT ON COLUMN public.enea_practices.azienda_dichiarata IS
  'Ragione sociale dichiarata dal rivenditore nel form pubblico del sito. Usata come nome azienda nei messaggi al cliente finale quando la pratica è ancora sul segnaposto "Da abbinare".';

-- Backfill delle pratiche già arrivate dal sito: estrae la ragione sociale
-- dalla riga "Azienda dichiarata: <ragione> · <email>" della nota di audit.
UPDATE public.enea_practices
SET azienda_dichiarata = btrim(
  (regexp_match(note, 'Azienda dichiarata:\s*([^\n·]+)'))[1]
)
WHERE azienda_dichiarata IS NULL
  AND note ~ 'Azienda dichiarata:\s*[^\n·]+';

-- Aggiorna la view enea_practices_public per esporre la nuova colonna
-- (replica la definizione di 20260605130000_stage_entered_at.sql + 1 colonna).
-- azienda_dichiarata è gated su is_internal come le altre colonne di lavorazione:
-- serve allo staff per l'abbinamento, il rivenditore non deve leggere la ragione
-- sociale dichiarata da terzi su una pratica riassegnata.
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
  END AS dati_form,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.azienda_dichiarata ELSE NULL END AS azienda_dichiarata
FROM public.enea_practices ep;

GRANT SELECT ON public.enea_practices_public TO authenticated;
