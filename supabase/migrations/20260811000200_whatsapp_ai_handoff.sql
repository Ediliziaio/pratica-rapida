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

-- Fail-safe anche per conversazioni gia' assegnate quando la migration viene applicata:
-- il default `assist` non deve lasciare attiva l'AI su chat gia' prese in carico.
UPDATE public.whatsapp_conversations
SET
  ai_mode = 'paused',
  ai_mode_updated_at = now(),
  ai_mode_updated_by = assigned_to,
  ai_pause_reason = COALESCE(ai_pause_reason, 'Presa in carico da operatore')
WHERE assigned_to IS NOT NULL
  AND ai_mode <> 'paused';

-- La presa in carico non deve dipendere dal fatto che l'interfaccia ricordi di
-- sospendere l'AI: il database applica il fail-safe sia alle nuove conversazioni
-- create gia' assegnate sia a ogni assegnazione successiva. La rimozione
-- dell'assegnazione NON riattiva automaticamente l'AI; la ripresa deve essere
-- una scelta esplicita.
CREATE OR REPLACE FUNCTION public.pause_whatsapp_ai_on_human_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    NEW.ai_mode := 'paused';
    NEW.ai_mode_updated_at := now();
    NEW.ai_mode_updated_by := NEW.assigned_to;
    NEW.ai_pause_reason := 'Presa in carico da operatore';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pause_whatsapp_ai_on_human_assignment
  ON public.whatsapp_conversations;
CREATE TRIGGER trg_pause_whatsapp_ai_on_human_assignment
BEFORE INSERT OR UPDATE OF assigned_to
ON public.whatsapp_conversations
FOR EACH ROW
EXECUTE FUNCTION public.pause_whatsapp_ai_on_human_assignment();
