-- ============================================================
-- Chat WhatsApp in-app: tabelle `whatsapp_conversations` +
-- `whatsapp_messages`.
--
-- Modello dati:
--  - whatsapp_conversations: una conversation per numero di telefono
--    (chiave naturale = phone normalizzato). Tiene contatori e
--    timestamp dell'ultimo messaggio per ordinare la lista chat.
--  - whatsapp_messages: ogni messaggio (inbound + outbound), legato
--    alla conversation. Storia completa per audit + thread UI.
--
-- Differenza con communication_log:
--  - communication_log = audit log per CONTESTAZIONE (immutabile,
--    practice-centric, contiene anche email/sms/phone).
--  - whatsapp_messages = thread per CHAT in-app (phone-centric,
--    permette di rispondere/ricevere in tempo reale).
-- ============================================================

-- Conversation: una per numero di telefono
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identità contatto
  phone TEXT NOT NULL UNIQUE,             -- normalizzato: solo digit, no +
  display_name TEXT,                      -- nome di profilo WhatsApp (da webhook)
  practice_id UUID REFERENCES public.enea_practices(id) ON DELETE SET NULL,
                                          -- collegamento pratica (best-effort, può essere null)

  -- Contatori + ultimo messaggio
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,              -- prime 200 char del body
  last_message_direction TEXT,            -- 'inbound' | 'outbound'
  unread_count INTEGER NOT NULL DEFAULT 0,

  -- 24-hour customer service window (Meta policy)
  -- Se NULL o > 24h fa, possiamo solo inviare TEMPLATE (non testo libero).
  last_inbound_at TIMESTAMPTZ,

  -- Assegnazione interna (chi sta gestendo la chat)
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Lifecycle
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON public.whatsapp_conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wa_conv_unread ON public.whatsapp_conversations(unread_count) WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_wa_conv_practice ON public.whatsapp_conversations(practice_id) WHERE practice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conv_archived ON public.whatsapp_conversations(is_archived) WHERE is_archived = false;

-- Messaggio
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,

  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'template', 'image', 'document', 'audio', 'video', 'location', 'contact', 'sticker', 'system')),

  -- Content
  body TEXT,                              -- testo (per text e template render)
  template_name TEXT,                     -- se message_type='template'
  template_components JSONB,              -- parametri usati nel template
  media_url TEXT,                         -- URL Meta per media (scaricabile via API)
  media_mime_type TEXT,

  -- Tracking Meta
  wa_message_id TEXT UNIQUE,              -- id Meta (wamid.xxx); unique per dedup
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,                     -- se status='failed'

  -- Sender (per outbound: chi ha scritto)
  sent_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Lifecycle
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON public.whatsapp_messages(conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_wa_id ON public.whatsapp_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_msg_status ON public.whatsapp_messages(status);

-- ============================================================
-- Trigger: dopo INSERT/UPDATE messaggio, aggiorna la conversation
-- (last_message_at, last_message_preview, unread_count, last_inbound_at)
-- ============================================================

CREATE OR REPLACE FUNCTION public.touch_whatsapp_conversation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.whatsapp_conversations
    SET
      last_message_at = NEW.sent_at,
      last_message_preview = COALESCE(LEFT(NEW.body, 200), '[' || NEW.message_type || ']'),
      last_message_direction = NEW.direction,
      last_inbound_at = CASE WHEN NEW.direction = 'inbound' THEN NEW.sent_at ELSE last_inbound_at END,
      unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
      updated_at = now()
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_msg_touch_conv ON public.whatsapp_messages;
CREATE TRIGGER trg_wa_msg_touch_conv
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_whatsapp_conversation();

-- updated_at trigger su conversations
CREATE OR REPLACE FUNCTION public.touch_whatsapp_conv_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_conv_updated_at ON public.whatsapp_conversations;
CREATE TRIGGER trg_wa_conv_updated_at
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_whatsapp_conv_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Internal users (super_admin + operatore) accesso completo
CREATE POLICY "Internal manage whatsapp conversations"
  ON public.whatsapp_conversations FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()))
  WITH CHECK (public.is_internal(auth.uid()));

CREATE POLICY "Internal manage whatsapp messages"
  ON public.whatsapp_messages FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()))
  WITH CHECK (public.is_internal(auth.uid()));

-- ============================================================
-- Realtime: abilita publication per push live al frontend
-- (Supabase Realtime usa logical replication su questa publication)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;

COMMENT ON TABLE public.whatsapp_conversations IS
  'Conversazione WhatsApp per numero di telefono. Una per phone. Usata dalla chat in-app /admin/whatsapp-chat.';
COMMENT ON TABLE public.whatsapp_messages IS
  'Singolo messaggio WhatsApp (inbound + outbound). Storia thread per chat UI.';
COMMENT ON COLUMN public.whatsapp_conversations.last_inbound_at IS
  'Timestamp ultimo messaggio inbound. Se > 24h fa, Meta vieta invio di testo libero — solo template.';
