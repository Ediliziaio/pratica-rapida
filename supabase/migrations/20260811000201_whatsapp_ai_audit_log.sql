-- ============================================================
-- WhatsApp + AI + CRM — audit delle decisioni, senza contenuto messaggi
-- Laboratorio: non attiva alcuna risposta automatica.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_ai_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  inbound_message_id UUID REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  ai_mode TEXT NOT NULL CHECK (ai_mode IN ('assist', 'auto', 'paused')),
  category TEXT NOT NULL CHECK (category IN (
    'practice_status',
    'missing_documents',
    'approved_faq',
    'complaint',
    'regulatory',
    'price_or_discount',
    'exception',
    'unknown'
  )),
  action TEXT NOT NULL CHECK (action IN ('human_only', 'draft_only', 'auto_send')),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  crm_grounded BOOLEAN NOT NULL DEFAULT false,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_audit_conversation
  ON public.whatsapp_ai_audit_log(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_audit_action
  ON public.whatsapp_ai_audit_log(action, created_at DESC);

ALTER TABLE public.whatsapp_ai_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage whatsapp ai audit"
  ON public.whatsapp_ai_audit_log FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()))
  WITH CHECK (public.is_internal(auth.uid()));

COMMENT ON TABLE public.whatsapp_ai_audit_log IS
  'Audit minimale delle decisioni WhatsApp AI. Non conserva body, prompt, documenti, URL, CF, indirizzi o altri contenuti sensibili.';
