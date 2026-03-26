-- =============================================
-- PRATICA RAPIDA v2.0 — Migration 002
-- Pipeline Stages (Kanban configurabile per rivenditore)
-- =============================================

CREATE TYPE public.stage_type AS ENUM(
  'inviata',
  'attesa_compilazione',
  'pronte_da_fare',
  'documenti_mancanti',
  'da_inviare',
  'gestionale',
  'recensione',
  'archiviate'
);

CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  -- NULL = stage globale di sistema (template)
  name TEXT NOT NULL,
  stage_type stage_type NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#64748b',
  brand TEXT DEFAULT 'enea',
  is_visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Internal users manage all stages"
  ON public.pipeline_stages FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()));

CREATE POLICY "Resellers manage own stages"
  ON public.pipeline_stages FOR ALL
  TO authenticated
  USING (
    reseller_id = public.get_reseller_company_id(auth.uid())
    OR reseller_id IS NULL
  );

CREATE POLICY "Anyone authenticated can read stages"
  ON public.pipeline_stages FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_pipeline_stages_reseller ON public.pipeline_stages(reseller_id);
CREATE INDEX idx_pipeline_stages_brand ON public.pipeline_stages(brand, order_index);
