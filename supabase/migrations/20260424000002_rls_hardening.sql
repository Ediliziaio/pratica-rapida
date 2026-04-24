-- ============================================================
-- RLS Hardening — Pratica Rapida
-- Audit findings: chiude leakage di contenuti/note interne
-- verso i rivenditori.
-- ============================================================

-- ------------------------------------------------------------
-- 1) communication_log — nasconde il contenuto ai rivenditori
--
-- Spec §7.1: "Non vengono mostrati i contenuti delle
-- conversazioni, solo il log degli invii e dei contatti".
--
-- Soluzione: view SECURITY INVOKER con solo le colonne "di log"
-- (no subject, body_preview, notes, metadata, recipient).
-- La policy RLS della tabella base continua a filtrare per
-- practice_id → reseller_id, ma nella view mascheriamo i campi.
--
-- L'applicazione dovrà (per i rivenditori) leggere dalla view
-- "communication_log_public" invece della tabella.
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW public.communication_log_public
WITH (security_invoker = true) AS
SELECT
  cl.id,
  cl.practice_id,
  cl.channel,
  cl.direction,
  cl.status,
  cl.sent_at,
  cl.read_at,
  -- subject e body_preview mascherati per i non-internal
  CASE WHEN public.is_internal(auth.uid()) THEN cl.subject ELSE NULL END AS subject,
  CASE WHEN public.is_internal(auth.uid()) THEN cl.body_preview ELSE NULL END AS body_preview,
  CASE WHEN public.is_internal(auth.uid()) THEN cl.notes ELSE NULL END AS notes,
  CASE WHEN public.is_internal(auth.uid()) THEN cl.recipient ELSE NULL END AS recipient,
  CASE WHEN public.is_internal(auth.uid()) THEN cl.metadata ELSE '{}'::jsonb END AS metadata,
  CASE WHEN public.is_internal(auth.uid()) THEN cl.error_message ELSE NULL END AS error_message,
  cl.outcome
FROM public.communication_log cl;

GRANT SELECT ON public.communication_log_public TO authenticated;

COMMENT ON VIEW public.communication_log_public IS
  'View masked per rivenditori: il contenuto (subject/body_preview/notes/recipient/metadata) è NULL per i non-internal. Usata dalla UI del rivenditore al posto della tabella diretta.';

-- ------------------------------------------------------------
-- 2) Impedire INSERT/UPDATE/DELETE ai rivenditori su communication_log
--
-- La policy "Internal users full access on comm_log" esiste già.
-- Aggiungiamo una policy esplicita che blocca write per chi non
-- è internal (difesa in profondità — con solo la policy SELECT
-- per resellers, le write sarebbero già negate, ma è utile
-- rendere la posture esplicita).
-- ------------------------------------------------------------

-- Nessuna policy aggiuntiva necessaria: in assenza di policy
-- INSERT/UPDATE/DELETE per un ruolo, le scritture sono negate.
-- Verifichiamo però che non esistano policy permissive.
DO $$
DECLARE
  policy_count int;
BEGIN
  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'communication_log'
    AND cmd IN ('INSERT','UPDATE','DELETE')
    AND policyname NOT LIKE '%Internal%';
  IF policy_count > 0 THEN
    RAISE EXCEPTION 'Unexpected write policy on communication_log for non-internal users';
  END IF;
END$$;

-- ------------------------------------------------------------
-- 3) enea_practices — mascherare note_interne ai rivenditori
--
-- Spec: i rivenditori non devono vedere le note interne.
-- La RLS passa attraverso la riga intera. Aggiungiamo una view
-- "enea_practices_public" con la colonna note_interne mascherata
-- per i non-internal.
-- Rimane invariata la tabella base, usata dagli operatori interni
-- e dall'update-form-rivenditore (che non scrive note_interne).
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW public.enea_practices_public
WITH (security_invoker = true) AS
SELECT
  ep.id,
  ep.reseller_id,
  ep.current_stage_id,
  ep.brand,
  ep.cliente_nome,
  ep.cliente_cognome,
  ep.cliente_email,
  ep.cliente_telefono,
  ep.cliente_indirizzo,
  ep.cliente_cf,
  ep.prodotto_installato,
  ep.fornitore,
  ep.note,
  -- note_interne: NULL per non-internal
  CASE WHEN public.is_internal(auth.uid()) THEN ep.note_interne ELSE NULL END AS note_interne,
  ep.fatture_urls,
  ep.documenti_enea_urls,
  ep.documenti_aggiuntivi_urls,
  ep.documenti_mancanti,
  ep.note_documenti_mancanti,
  -- guadagni: solo internal
  CASE WHEN public.is_internal(auth.uid()) THEN ep.guadagno_lordo ELSE NULL END AS guadagno_lordo,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.guadagno_netto ELSE NULL END AS guadagno_netto,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.note_gestionale ELSE NULL END AS note_gestionale,
  ep.data_invio_pratica,
  ep.operatore_id,
  ep.assigned_at,
  ep.ultimo_sollecito_privato,
  ep.conteggio_solleciti,
  ep.ultimo_sollecito_fornitore,
  ep.form_compilato_at,
  -- form_token: solo internal (evita enumeration da parte di reseller non proprietario via join)
  CASE WHEN public.is_internal(auth.uid()) THEN ep.form_token
       WHEN ep.reseller_id = public.get_reseller_company_id(auth.uid()) THEN ep.form_token
       ELSE NULL END AS form_token,
  ep.recensione_richiesta_at,
  ep.recensione_ricevuta_at,
  ep.recensione_testo,
  ep.recensione_stelle,
  ep.archived_at,
  ep.created_at,
  ep.updated_at,
  ep.pratica_enea_conclusa_urls,
  -- tipo_fatturazione e tipo_servizio: classificazione interna (§2.3, §3.3)
  CASE WHEN public.is_internal(auth.uid()) THEN ep.tipo_fatturazione ELSE NULL END AS tipo_fatturazione,
  CASE WHEN public.is_internal(auth.uid()) THEN ep.tipo_servizio ELSE NULL END AS tipo_servizio,
  ep.tipo_soggetto,
  ep.archivio_path
FROM public.enea_practices ep;

GRANT SELECT ON public.enea_practices_public TO authenticated;

COMMENT ON VIEW public.enea_practices_public IS
  'View masked per rivenditori: note_interne, guadagno_*, note_gestionale, tipo_fatturazione, tipo_servizio sono NULL per i non-internal. La RLS sulla tabella base filtra già per reseller_id.';

-- ------------------------------------------------------------
-- 4) automation_rules — rendere read-only per rivenditori
--
-- La policy corrente "Authenticated users read automation rules"
-- permette a TUTTI gli authenticated (compresi i rivenditori) di
-- leggere le regole di automazione interne. Le regole contengono
-- trigger/config di business interno: non c'è motivo di mostrarle
-- ai rivenditori.
--
-- Restringiamo la SELECT ai soli internal.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users read automation rules"
  ON public.automation_rules;

-- La policy "Internal users manage automation rules" copre già
-- SELECT/INSERT/UPDATE/DELETE per gli internal — non serve altro.
-- I rivenditori rimangono senza accesso (default deny).

-- ------------------------------------------------------------
-- 5) pipeline_stages — irrigidire SELECT
--
-- La policy "Anyone authenticated can read stages" espone TUTTI
-- gli stage (compresi quelli privati di altri rivenditori) a
-- chiunque sia autenticato. Gli stage di sistema (reseller_id
-- IS NULL) sono condivisi — OK. Ma i custom stage di rivenditori
-- X non devono essere visibili a rivenditore Y.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone authenticated can read stages"
  ON public.pipeline_stages;

CREATE POLICY "Authenticated read system and own stages"
  ON public.pipeline_stages FOR SELECT
  TO authenticated
  USING (
    public.is_internal(auth.uid())
    OR reseller_id IS NULL
    OR reseller_id = public.get_reseller_company_id(auth.uid())
  );

-- ------------------------------------------------------------
-- 6) fatture_insolute — verifica isolamento reseller
--
-- Le policy esistenti sono corrette:
--   fatture_insolute_staff_all       → super_admin / operatore
--   fatture_insolute_reseller_select → reseller_id = company_id
--
-- Non servono modifiche. Aggiungiamo solo un index per efficienza
-- se mancante (già presente in realtà) — no-op qui.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 7) enea_practices — INSERT policy: impedisce che un reseller
-- crei pratiche intestate ad ALTRI reseller (spoofing).
--
-- La policy "Resellers insert own practices" già lo fa tramite
-- WITH CHECK. Verifichiamo che sia corretta e aggiungiamo una
-- DELETE policy negativa esplicita (i reseller non devono poter
-- cancellare pratiche — solo archiviarle).
-- ------------------------------------------------------------

-- Nessuna policy DELETE per resellers → DELETE è già negata.
-- Policy "Internal users full access" consente DELETE agli
-- internal. Non modifichiamo nulla.

-- ------------------------------------------------------------
-- FINE — Report audit:
--
-- [A] communication_log body leakage:
--     MITIGATO via view communication_log_public + UI gating.
--     La UI dei rivenditori dovrebbe essere migrata a leggere
--     dalla view per difesa in profondità.
--
-- [B] note_interne visibility:
--     MITIGATO via view enea_practices_public + UI gating.
--
-- [C] fatture_insolute isolation: GIÀ COMPLIANT.
--
-- [D] form_token: GIÀ COMPLIANT (no policy anon su enea_practices).
--     Se si abilita il form pubblico, aggiungere una funzione
--     SECURITY DEFINER `get_practice_by_form_token(text)` invece
--     di una policy anon broad.
--
-- [E] CF badge / tipo_fatturazione: UI MITIGATA.
--     Colonna resta esposta via tabella base → la view
--     enea_practices_public la maschera.
--
-- [F] tipo_servizio badge: UI MITIGATA.
--     Stesso trattamento di [E] via view.
-- ------------------------------------------------------------
