-- ============================================================
-- Leads — pipeline dei contatti commerciali
--
-- Sostituisce platform_settings.value['crm_leads'] (JSONB array) con una
-- vera tabella, così:
--   1. il form pubblico nelle landing page può inserire lead come "anon"
--      (senza login), con check restrittivi nel WITH CHECK della policy
--   2. lo staff (super_admin + operatore) gestisce, modifica, sposta nelle
--      colonne kanban della /aziende > pipeline
--   3. evita race condition di concurrent read-modify-write su un JSONB
--
-- Source = origine del lead (per tracking attribuzione)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dati contatto
  nome TEXT NOT NULL,
  cognome TEXT,
  email TEXT,
  telefono TEXT,
  citta TEXT,
  note TEXT,

  -- Tracking
  source TEXT NOT NULL DEFAULT 'manual',  -- 'public_form' | 'manual' | 'whatsapp' | 'import'
  page_url TEXT,                          -- URL pagina di provenienza (solo public_form)

  -- Pipeline state — stage_id matches CrmStage.id used in AziendePipeline
  stage_id TEXT NOT NULL DEFAULT 'lead',

  -- Lifecycle
  contacted_at TIMESTAMPTZ,
  contacted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Soft validation: at least one contact method
  CONSTRAINT leads_has_contact CHECK (
    (email IS NOT NULL AND length(trim(email)) > 0)
    OR (telefono IS NOT NULL AND length(trim(telefono)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_archived ON public.leads(archived_at)
  WHERE archived_at IS NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_leads_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS leads_updated_at ON public.leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_leads_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonimi) può inserire lead, ma SOLO con source='public_form'
-- e con limiti di lunghezza per prevenire abuse via form pubblico
DROP POLICY IF EXISTS "Public submit lead" ON public.leads;
CREATE POLICY "Public submit lead"
  ON public.leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    source = 'public_form'
    AND nome IS NOT NULL AND length(trim(nome)) BETWEEN 1 AND 100
    AND length(coalesce(cognome, '')) <= 100
    AND length(coalesce(email, '')) <= 200
    AND length(coalesce(telefono, '')) <= 50
    AND length(coalesce(citta, '')) <= 100
    AND length(coalesce(note, '')) <= 1000
    AND length(coalesce(page_url, '')) <= 500
    -- only one of email/telefono required (enforced by CHECK constraint above)
    -- super_admin / operatore who want to insert manually use a different policy below
    AND archived_at IS NULL
    AND contacted_at IS NULL
  );

-- Staff (super_admin + operatore) può fare tutto
DROP POLICY IF EXISTS "Staff manage leads" ON public.leads;
CREATE POLICY "Staff manage leads"
  ON public.leads FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'operatore'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'operatore'::app_role)
  );

COMMENT ON TABLE public.leads IS
  'Pipeline lead commerciali. INSERT pubblico via form landing (RLS source=public_form). Gestione staff via /aziende > pipeline.';

-- ============================================================
-- Backfill: copia eventuali lead da platform_settings.crm_leads
-- ============================================================
DO $$
DECLARE
  legacy_data jsonb;
BEGIN
  SELECT value INTO legacy_data
  FROM public.platform_settings
  WHERE key = 'crm_leads' AND jsonb_typeof(value) = 'array';

  IF legacy_data IS NOT NULL THEN
    INSERT INTO public.leads (nome, cognome, email, telefono, note, stage_id, source, created_at)
    SELECT
      COALESCE(NULLIF(trim(l->>'nome'), ''), '(senza nome)'),
      NULLIF(trim(l->>'cognome'), ''),
      NULLIF(trim(l->>'email'), ''),
      NULLIF(trim(l->>'telefono'), ''),
      NULLIF(trim(l->>'note'), ''),
      COALESCE(NULLIF(trim(l->>'stage_id'), ''), 'lead'),
      'manual',
      COALESCE((l->>'created_at')::timestamptz, now())
    FROM jsonb_array_elements(legacy_data) AS l
    -- Skip records that don't satisfy the leads_has_contact CHECK
    WHERE (NULLIF(trim(l->>'email'), '') IS NOT NULL OR NULLIF(trim(l->>'telefono'), '') IS NOT NULL);
  END IF;
END $$;
