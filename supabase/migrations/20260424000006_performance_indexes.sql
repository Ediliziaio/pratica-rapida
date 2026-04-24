-- ============================================================
-- Performance indexes — Pratica Rapida
--
-- Audit findings: frequently queried columns missing indexes.
-- Every index here is additive (IF NOT EXISTS) and designed to
-- support hot paths already shipped in the frontend/edge functions.
-- ============================================================

-- ------------------------------------------------------------
-- 1) enea_practices.operatore_id
--
-- useEneaPractices(filters.operatoreId) does .eq("operatore_id", …)
-- for the operator filter in Kanban/Coda. Without an index this is a
-- seq scan on the full practices table.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_enea_practices_operatore
  ON public.enea_practices(operatore_id)
  WHERE operatore_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2) enea_practices.created_at DESC
--
-- useEneaPractices() orders by created_at desc for the default list.
-- A DESC index makes ORDER BY + LIMIT an index scan.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_enea_practices_created_at
  ON public.enea_practices(created_at DESC);

-- ------------------------------------------------------------
-- 3) enea_practices.archived_at DESC (non-partial)
--
-- The ArchivioEnea page orders archived practices by archived_at desc
-- with .not("archived_at","is",null). The existing
-- idx_enea_practices_archived is a partial WHERE archived_at IS NULL
-- and therefore does NOT cover this query. Add a full index on the
-- non-null rows to accelerate the archive view.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_enea_practices_archived_at_desc
  ON public.enea_practices(archived_at DESC)
  WHERE archived_at IS NOT NULL;

-- ------------------------------------------------------------
-- 4) enea_practices.form_compilato_at
--
-- process-automations edge function filters on
-- form_compilato_at IS NULL and ultimo_sollecito_privato IS NULL
-- across all active practices (days_waiting_7 rule). This runs on
-- every scheduled tick. Partial index on the pending-form rows.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_enea_practices_pending_form
  ON public.enea_practices(ultimo_sollecito_privato)
  WHERE form_compilato_at IS NULL AND archived_at IS NULL;

-- ------------------------------------------------------------
-- 5) enea_practices.reseller_id + archived_at
--
-- ArchivioEnea rivenditore combines reseller_id = X AND
-- archived_at IS NOT NULL ORDER BY archived_at DESC. A compound
-- partial index makes this a single index scan.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_enea_practices_reseller_archived
  ON public.enea_practices(reseller_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;

-- ------------------------------------------------------------
-- 6) communication_log.sent_at DESC
--
-- ComunicazioniLog page runs SELECT * ORDER BY sent_at DESC LIMIT 500
-- globally (no filter). The existing idx_comm_log_channel (channel,
-- sent_at) is not usable without a channel filter.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_comm_log_sent_at
  ON public.communication_log(sent_at DESC);

-- ------------------------------------------------------------
-- 7) communication_log (practice_id, sent_at DESC)
--
-- CommLogSection in KanbanBoard sheet:
--   .eq("practice_id", id).order("sent_at", desc)
-- Compound index lets Postgres skip the sort.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_comm_log_practice_sent_at
  ON public.communication_log(practice_id, sent_at DESC);

-- ------------------------------------------------------------
-- 8) automation_rules (is_enabled, order_index)
--
-- process-automations edge function filters is_enabled = true
-- ORDER BY order_index on every scheduled tick. Small table today,
-- but the workload is constant so a supporting index is cheap.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled_order
  ON public.automation_rules(is_enabled, order_index)
  WHERE is_enabled = TRUE;

-- ------------------------------------------------------------
-- 9) pipeline_stages system lookup (stage_type, brand)
--
-- FormPubblico submit does:
--   .is("reseller_id", null).eq("stage_type", X).eq("brand", Y)
-- The existing idx_pipeline_stages_brand (brand, order_index) does
-- not optimally support this. Add a partial index on system stages.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_system_lookup
  ON public.pipeline_stages(stage_type, brand)
  WHERE reseller_id IS NULL;

-- ------------------------------------------------------------
-- 10) client_form_tokens.pratica_id
--
-- Token lookups by id (UNIQUE index already exists for .eq("token"))
-- but listing tokens of a pratica does .eq("pratica_id", …). Cheap.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_client_form_tokens_pratica
  ON public.client_form_tokens(pratica_id);

-- ============================================================
-- End of performance indexes migration.
-- Verify with:
--   SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
--   WHERE schemaname = 'public' ORDER BY idx_scan DESC;
-- ============================================================
