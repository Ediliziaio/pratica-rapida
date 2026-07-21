-- Sezione "Chiamate": assegnazione manuale del cliente da chiamare a un
-- chiamante fisso (Samuele / Giuliano).
--
-- Il gestionale prevede che i clienti nelle prime due stage della pipeline
-- ("Inviato da chiamare" / "Chiamati in attesa") che NON hanno ancora
-- compilato il form vadano richiamati una volta a settimana per ricordare la
-- compilazione. La nuova pagina /admin/chiamate mostra questa coda e permette
-- di dividere i clienti tra i due chiamanti: qui persistiamo "chi deve
-- chiamare" con una semplice etichetta testuale (nessun FK a profiles: i due
-- chiamanti sono etichette fisse, non necessariamente account distinti).
--
-- Valori attesi: 'samuele' | 'giuliano' | NULL (non assegnato). Nessun CHECK
-- rigido per non dover migrare in futuro se si aggiunge un terzo chiamante.

ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS chiamate_assegnato_a text;

COMMENT ON COLUMN public.enea_practices.chiamate_assegnato_a IS
  'Chiamante assegnato per la coda /admin/chiamate (etichetta: samuele | giuliano | NULL). Solo uso interno.';

-- Riesponi la colonna tramite la view enea_practices_public (gated interno).
-- La view elenca le colonne una per una: senza ridefinirla il campo non arriva
-- mai al client. Replica la definizione corrente
-- (20260716110000_expose_data_fine_lavori_in_view.sql) aggiungendo in coda
-- chiamate_assegnato_a, visibile solo agli operatori interni.
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
  CASE WHEN public.is_internal(auth.uid()) THEN ep.azienda_dichiarata ELSE NULL END AS azienda_dichiarata,
  ep.data_fine_lavori,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.chiamate_assegnato_a ELSE NULL END AS chiamate_assegnato_a
FROM public.enea_practices ep;

GRANT SELECT ON public.enea_practices_public TO authenticated;
