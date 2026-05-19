-- ============================================================
-- Tabella `whatsapp_templates` — gestione template Meta da admin UI
--
-- Mappa i template approvati su Meta Business Manager allo schema
-- interno. Permette al super_admin di:
--  - vedere quali template sono disponibili (approved/pending/rejected)
--  - leggere body + variabili senza dover entrare in Meta
--  - mappare un template a un trigger event interno (collegamento usato
--    da `automation_rules` o dalla UI di Automazioni per il selettore)
--  - disabilitare un template senza eliminarlo
--
-- Il refresh dalla Meta Graph API è fatto da edge function
-- `whatsapp-meta-sync`, NON gestito direttamente da questa tabella.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificazione Meta
  meta_template_name TEXT NOT NULL,        -- nome esatto su Meta (case-sensitive)
  meta_template_id TEXT,                   -- id Meta (puo' cambiare se ricreato)
  language TEXT NOT NULL DEFAULT 'it',     -- code language ("it", "en_US", ...)

  -- Metadati Meta
  category TEXT,                           -- AUTHENTICATION | MARKETING | UTILITY
  status TEXT NOT NULL DEFAULT 'PENDING',  -- APPROVED | PENDING | REJECTED | PAUSED | DISABLED
  rejection_reason TEXT,                   -- se status=REJECTED

  -- Contenuto template
  header_type TEXT,                        -- TEXT | IMAGE | VIDEO | DOCUMENT | null
  header_text TEXT,
  body_text TEXT NOT NULL DEFAULT '',      -- body con {{1}}, {{2}} placeholders
  footer_text TEXT,
  buttons JSONB DEFAULT '[]'::jsonb,       -- array {type, text, url?, phone_number?}

  -- Variabili: array di { position: 1, name: "nome_cliente", description: "...", example: "Mario" }
  -- Compilato manualmente dall'admin dopo il sync (Meta non espone semantica)
  variables JSONB DEFAULT '[]'::jsonb,

  -- Mapping interno: collega il template a un trigger event interno
  -- (es. "days_waiting_7", "stage_changed"). Usato dal selettore in
  -- Automazioni per filtrare i template disponibili.
  -- Nullable: un template puo' non essere mappato (usato solo manualmente).
  mapped_trigger_event TEXT,

  -- Display friendly per admin UI (default = meta_template_name)
  display_name TEXT,
  description TEXT,

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,         -- disabilitazione manuale (override del status Meta)
  meta_last_synced_at TIMESTAMPTZ,                 -- ultima volta in cui edge function ha letto da Meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un template è univoco per (name, language)
  CONSTRAINT whatsapp_templates_name_lang_unique UNIQUE (meta_template_name, language)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status ON public.whatsapp_templates(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_active ON public.whatsapp_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_trigger ON public.whatsapp_templates(mapped_trigger_event) WHERE mapped_trigger_event IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_whatsapp_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_templates_updated_at ON public.whatsapp_templates;
CREATE TRIGGER trg_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_whatsapp_templates_updated_at();

-- RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Solo super_admin gestisce i template (creazione, sync, edit, mapping)
CREATE POLICY "Super admin manage whatsapp templates"
  ON public.whatsapp_templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Internal users (operatore) possono leggere per usarli nel pannello WhatsApp
CREATE POLICY "Internal read active whatsapp templates"
  ON public.whatsapp_templates FOR SELECT
  TO authenticated
  USING (
    public.is_internal(auth.uid())
    AND is_active = true
    AND status = 'APPROVED'
  );

COMMENT ON TABLE public.whatsapp_templates IS
  'Template WhatsApp approvati su Meta Business Manager. Sync periodico via edge function whatsapp-meta-sync.';
COMMENT ON COLUMN public.whatsapp_templates.variables IS
  'Array di {position, name, description, example} compilato manualmente dall''admin (Meta non espone semantica delle {{N}}).';
COMMENT ON COLUMN public.whatsapp_templates.mapped_trigger_event IS
  'Trigger event interno (es. days_waiting_7) per il selettore in Automazioni.';
