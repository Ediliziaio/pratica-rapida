-- ============================================================
-- Aggiunge `practice_id` a whatsapp_messages (denormalize) per audit.
--
-- La chat è phone-centric (whatsapp_conversations.phone) ma per
-- contestazione legale serve risalire dal singolo messaggio alla
-- pratica ENEA di riferimento. Senza questa colonna l'audit deve
-- attraversare conversation → practice_id, che può essere NULL
-- (cliente nuovo non ancora linkato) o aver cambiato nel tempo.
--
-- Denormalizzazione: copia il valore di conversation.practice_id
-- AL MOMENTO DELL'INSERT messaggio. Così il messaggio "ricorda" a
-- quale pratica era associato anche se la conversation viene
-- successivamente unlinkata o re-linkata.
-- ============================================================

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS practice_id UUID
    REFERENCES public.enea_practices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_msg_practice
  ON public.whatsapp_messages(practice_id)
  WHERE practice_id IS NOT NULL;

-- Backfill: per messaggi esistenti, copia da conversation.practice_id
UPDATE public.whatsapp_messages m
SET practice_id = c.practice_id
FROM public.whatsapp_conversations c
WHERE m.conversation_id = c.id
  AND m.practice_id IS NULL
  AND c.practice_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_messages.practice_id IS
  'Denormalizzazione di conversation.practice_id al momento dell''insert. Permette audit dal singolo messaggio senza dipendere dallo stato corrente della conversation.';
