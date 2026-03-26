-- =============================================
-- PRATICA RAPIDA v2.0 — Migration 005
-- Automation Rules
-- =============================================

CREATE TABLE public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL,
  -- es: stage_changed, practice_created, form_compiled,
  --     days_waiting_7, days_waiting_fornitore_30/60/90,
  --     recensione_7d_followup
  trigger_config JSONB DEFAULT '{}'::jsonb,
  channel comm_channel NOT NULL,
  template_id TEXT,
  template_body TEXT,
  is_enabled BOOLEAN DEFAULT TRUE,
  order_index INTEGER DEFAULT 0,
  category TEXT DEFAULT 'solleciti',
  -- categorie: solleciti, onboarding, recensione, fornitori, gestionale
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Internal users manage automation rules"
  ON public.automation_rules FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()));

CREATE POLICY "Authenticated users read automation rules"
  ON public.automation_rules FOR SELECT
  TO authenticated
  USING (true);
