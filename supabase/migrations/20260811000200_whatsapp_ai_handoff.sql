-- ============================================================
-- WhatsApp + AI + CRM — controllo umano esplicito
-- Branch laboratorio: nessun invio automatico viene attivato da questa migration.
--
-- Default `assist`: l'AI puo' preparare/suggerire, ma NON inviare in autonomia.
-- `auto` sara' usato solo per categorie sicure autorizzate.
-- `paused` e' la presa in carico umana: blocca ogni automazione AI sulla chat.
-- ============================================================

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS ai_mode TEXT NOT NULL DEFAULT 'assist'
    CHECK (ai_mode IN ('assist', 'auto', 'paused')),
  ADD COLUMN IF NOT EXISTS ai_mode_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ai_mode_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_pause_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_wa_conv_ai_mode
  ON public.whatsapp_conversations(ai_mode)
  WHERE is_archived = false;

COMMENT ON COLUMN public.whatsapp_conversations.ai_mode IS
  'assist=solo suggerimenti/draft; auto=risposte automatiche solo se policy applicativa lo consente; paused=presa in carico umana, nessuna risposta AI.';
COMMENT ON COLUMN public.whatsapp_conversations.ai_pause_reason IS
  'Motivo opzionale della presa in carico umana o sospensione AI.';
