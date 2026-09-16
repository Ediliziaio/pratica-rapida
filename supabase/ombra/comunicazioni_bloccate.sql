-- =============================================
-- CRM OMBRA — comunicazioni bloccate
-- =============================================
-- SOLO PROGETTO OMBRA. Questo file sta volutamente FUORI da supabase/migrations:
-- `supabase db push` non lo applica mai, quindi non arriva in produzione.
-- Zero impronta sul CRM vero (decisione del titolare, 14/09/2026).
--
-- Applicazione: SQL editor del progetto ombra, incolla ed esegui una volta
-- (dopo `supabase db push` delle migrazioni normali).
--
-- Nel progetto ombra (secret CRM_OMBRA=true, nessuna chiave
-- Resend/WhatsApp/ElevenLabs) le cinque funzioni in uscita — send-email,
-- send-whatsapp, notify-cliente, elevenlabs-call, send-reminders — non
-- spediscono: registrano qui cosa SAREBBE partito e ritornano.
-- Il CRM ombra è usa-e-getta; con lui sparisce anche questa tabella.

CREATE TABLE IF NOT EXISTS public.comunicazioni_bloccate (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funzione     text NOT NULL CHECK (funzione IN ('send-email', 'send-whatsapp', 'notify-cliente', 'elevenlabs-call', 'send-reminders')),
  canale       text NOT NULL CHECK (canale IN ('email', 'whatsapp', 'chiamata', 'notifica_cliente', 'reminder')),
  destinatario text,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.comunicazioni_bloccate IS
  'CRM ombra: comunicazioni che sarebbero partite (mail, WhatsApp, chiamate, solleciti) e sono state bloccate. Solo lettura per lo staff; scrive solo la service role delle edge function.';

CREATE INDEX IF NOT EXISTS idx_comunicazioni_bloccate_created_at
  ON public.comunicazioni_bloccate (created_at DESC);

ALTER TABLE public.comunicazioni_bloccate ENABLE ROW LEVEL SECURITY;

-- Lo staff interno legge; nessuno scrive dal client (le edge function usano la
-- service role, che bypassa RLS).
DROP POLICY IF EXISTS "Staff read comunicazioni bloccate" ON public.comunicazioni_bloccate;
CREATE POLICY "Staff read comunicazioni bloccate"
  ON public.comunicazioni_bloccate FOR SELECT
  TO authenticated
  USING (public.is_internal(auth.uid()));
