-- ============================================================================
-- Migration: Migrate legacy `pratiche` rows into `enea_practices`
-- Date: 2026-04-24
-- ============================================================================
--
-- CONTEXT
-- -------
-- The legacy `pratiche` table (11 rows of real data) is being superseded by
-- the new ENEA/Conto Termico canonical table `enea_practices`. This migration
-- copies each `pratiche` row into `enea_practices`, PRESERVING THE UUID, so
-- that the FK chain from the 14 dependent tables (notifications, audit_log,
-- documenti, practice_messages, client_form_tokens, wallet_movements,
-- calendar_events, email_logs, whatsapp_logs, checklist_items,
-- client_form_{infissi,schermature,impianto_termico,vepa}) continues to work
-- against `pratiche` while application code is migrated to read from
-- `enea_practices`. Both tables share the same logical id for each practice.
--
-- MAPPING
-- -------
--   pratiche.id                          -> enea_practices.id                (preserved)
--   pratiche.company_id                  -> enea_practices.reseller_id       (FK is companies.id despite the name)
--   pratiche.dati_pratica->>'brand'      -> enea_practices.brand             (default 'enea')
--   pratiche.stato                       -> enea_practices.current_stage_id  (via pipeline_stages)
--       'bozza'               -> stage_type 'inviata'
--       'inviata'             -> stage_type 'inviata'
--       'in_lavorazione'      -> stage_type 'pronte_da_fare'
--       'in_attesa_documenti' -> stage_type 'documenti_mancanti'
--       'completata'          -> stage_type 'archiviate'
--       'annullata'           -> stage_type 'archiviate'
--   pratiche.titolo (e.g. "Pratica ENEA - Mario Rossi")
--       -> cliente_nome / cliente_cognome (best-effort parsed from suffix)
--   pratiche.dati_pratica->>'tipo_servizio' -> enea_practices.tipo_servizio
--   pratiche.descrizione + note_consegna    -> enea_practices.note
--   pratiche.created_at                  -> enea_practices.created_at / updated_at
--   pratiche.completata_at               -> enea_practices.archived_at (only if stato='completata')
--
-- DATA NOT CARRIED OVER
-- ---------------------
-- - `categoria` (always 'enea_bonus'), `priorita`, `valuta`, `prezzo`, `is_free`,
--   `pagamento_stato`, `scadenza`: not represented in enea_practices. Billing
--   moved to `wallet_movements`; pricing moved to pipeline/service config.
-- - `dati_pratica->>'tipo_intervento'`, `importo_lavori`, `data_fine_lavori`:
--   belong to the client forms (`client_form_*`), not the practice header.
-- - `service_id`, `cliente_finale_id`, `creato_da`, `assegnatario_id`:
--   legacy user/assignment metadata; enea_practices uses `operatore_id`,
--   `assegnato_at` and the pipeline stage for workflow state instead.
-- - `output_urls` (always empty on all 11 rows).
--
-- FK INTEGRITY
-- ------------
-- Dependent tables (14 tables total) still FK-point to `pratiche.id`. We
-- deliberately leave those FKs untouched for safety; because we preserve the
-- same UUID in both tables, both reads (legacy FKs via `pratiche`, new code
-- via `enea_practices`) resolve to the same logical practice. Future work:
-- repoint FKs to `enea_practices.id` and DROP `pratiche`.
--
-- SAFETY
-- ------
-- - Idempotent: ON CONFLICT (id) DO NOTHING.
-- - The legacy `pratiche` table is NOT dropped/truncated - kept as reference
--   and is marked DEPRECATED via COMMENT.
-- - If cliente_nome/cliente_cognome cannot be parsed, sensible fallbacks
--   ('Cliente' / '-' / 'Legacy') are used so the NOT NULL constraint holds.
-- ============================================================================

WITH parsed AS (
  SELECT
    p.id,
    p.company_id,
    p.stato::text                                   AS stato_text,
    p.dati_pratica,
    COALESCE(p.dati_pratica->>'brand', 'enea')      AS brand_text,
    p.created_at,
    p.completata_at,
    -- Strip the "Pratica <Brand> - " prefix (case-insensitive, up to 2 brand tokens
    -- to handle "Pratica Conto Termico - "), keeping only the client portion.
    TRIM(REGEXP_REPLACE(p.titolo, '^Pratica\s+\S+(?:\s+\S+)?\s*-\s*', '', 'i')) AS cliente_raw,
    NULLIF(TRIM(COALESCE(p.descrizione, '') ||
        CASE WHEN COALESCE(p.note_consegna, '') <> ''
          THEN E'\n' || p.note_consegna
          ELSE ''
        END), '') AS note_combined
  FROM pratiche p
),
split_name AS (
  SELECT
    pr.*,
    -- First whitespace-separated word -> nome; rest -> cognome
    NULLIF(SPLIT_PART(cliente_raw, ' ', 1), '')                                         AS nome_part,
    NULLIF(TRIM(SUBSTRING(cliente_raw FROM POSITION(' ' IN cliente_raw) + 1)), '')      AS cognome_part
  FROM parsed pr
)
INSERT INTO enea_practices (
  id,
  reseller_id,
  current_stage_id,
  brand,
  cliente_nome,
  cliente_cognome,
  tipo_servizio,
  note,
  created_at,
  updated_at,
  archived_at
)
SELECT
  s.id,
  s.company_id,
  (
    SELECT ps.id
    FROM pipeline_stages ps
    WHERE ps.reseller_id IS NULL
      AND ps.brand = s.brand_text
      AND ps.stage_type::text = CASE s.stato_text
        WHEN 'bozza'               THEN 'inviata'
        WHEN 'inviata'             THEN 'inviata'
        WHEN 'in_lavorazione'      THEN 'pronte_da_fare'
        WHEN 'in_attesa_documenti' THEN 'documenti_mancanti'
        WHEN 'completata'          THEN 'archiviate'
        WHEN 'annullata'           THEN 'archiviate'
        ELSE 'inviata'
      END
    LIMIT 1
  ),
  s.brand_text::practice_brand,
  COALESCE(s.nome_part, 'Cliente'),
  COALESCE(s.cognome_part, CASE WHEN s.nome_part IS NOT NULL THEN '-' ELSE 'Legacy' END),
  COALESCE(s.dati_pratica->>'tipo_servizio', 'servizio_completo'),
  s.note_combined,
  s.created_at,
  s.created_at,
  CASE WHEN s.stato_text = 'completata' THEN s.completata_at ELSE NULL END
FROM split_name s
ON CONFLICT (id) DO NOTHING;

-- Mark the legacy table as deprecated
COMMENT ON TABLE pratiche IS 'DEPRECATED 2026-04-24: data migrated to enea_practices with preserved UUIDs. Retained for FK back-compat (notifications, audit_log, documenti, practice_messages, client_form_tokens, wallet_movements, calendar_events, email_logs, whatsapp_logs, checklist_items, client_form_*). Do not write new rows.';
