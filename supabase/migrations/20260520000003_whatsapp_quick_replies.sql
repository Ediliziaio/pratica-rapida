-- ============================================================
-- Tabella `whatsapp_quick_replies` — canned responses per la chat.
--
-- Permette allo staff di salvare risposte ricorrenti (saluti, FAQ
-- standard, info pratica) e inserirle nella chat con un click.
--
-- Scope: globale per Pratica Rapida (single-tenant). Tutti gli internal
-- users vedono e usano le stesse quick replies. Solo super_admin
-- può creare/modificare/eliminare (gli operatori le usano in sola
-- lettura).
--
-- NB: NON sostituisce i template Meta — i template sono per messaggi
-- transazionali fuori dalla finestra 24h, le quick replies sono testo
-- libero che si attacca al composer dentro la finestra 24h.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Etichetta breve (mostrata nel popover)
  label TEXT NOT NULL,
  -- Body completo che va nel composer
  body TEXT NOT NULL,
  -- Categoria libera per raggruppare (es. "Saluti", "FAQ", "Info pratica")
  category TEXT,

  -- Ordering manuale + visibilità
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Contatore utilizzi (per ordinamento smart "più usate")
  usage_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_wa_qr_active ON public.whatsapp_quick_replies(sort_order, label) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_wa_qr_category ON public.whatsapp_quick_replies(category) WHERE category IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_wa_quick_replies()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_qr_updated_at ON public.whatsapp_quick_replies;
CREATE TRIGGER trg_wa_qr_updated_at
  BEFORE UPDATE ON public.whatsapp_quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.touch_wa_quick_replies();

-- RLS
ALTER TABLE public.whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;

-- Tutti gli internal users (super_admin + operatore) leggono i template attivi
CREATE POLICY "Internal read whatsapp quick replies"
  ON public.whatsapp_quick_replies FOR SELECT
  TO authenticated
  USING (public.is_internal(auth.uid()));

-- Solo super_admin crea/modifica/elimina
CREATE POLICY "Super admin manage whatsapp quick replies"
  ON public.whatsapp_quick_replies FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Tutti gli internal users incrementano usage_count quando usano una reply
-- (UPDATE limitato a usage_count via funzione SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.increment_quick_reply_usage(_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_internal(auth.uid()) THEN
    RAISE EXCEPTION 'access denied: internal users only';
  END IF;
  UPDATE public.whatsapp_quick_replies
  SET usage_count = usage_count + 1
  WHERE id = _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_quick_reply_usage(UUID) TO authenticated;

-- Seed: 6 quick replies di esempio per partire subito
INSERT INTO public.whatsapp_quick_replies (label, body, category, sort_order) VALUES
  ('Saluti iniziali', 'Buongiorno! Sono dello staff di Pratica Rapida. Come posso aiutarla?', 'Saluti', 10),
  ('Saluti chiusura', 'La ringrazio per averci contattato. Buona giornata!', 'Saluti', 20),
  ('Documenti ricevuti', 'Confermiamo la ricezione dei documenti. Procediamo con la lavorazione e la teniamo aggiornato.', 'Conferme', 30),
  ('Documenti mancanti', 'Per completare la pratica ci servono ancora alcuni documenti. Glieli elenco tra poco.', 'FAQ', 40),
  ('Tempi lavorazione', 'I tempi medi di lavorazione sono di 5-7 giorni lavorativi dalla ricezione di tutta la documentazione completa.', 'FAQ', 50),
  ('In carico tecnico', 'La sua pratica è stata presa in carico dal nostro tecnico. Riceverà aggiornamenti via WhatsApp e email.', 'Conferme', 60)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.whatsapp_quick_replies IS
  'Canned responses globali per la chat WhatsApp. Risposte ricorrenti che lo staff può inserire nel composer con un click.';
