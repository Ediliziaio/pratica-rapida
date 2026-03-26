-- =============================================
-- PRATICA RAPIDA v2.0 — Migration 004
-- Communication Log (anti-contestazione)
-- =============================================

CREATE TYPE public.comm_channel AS ENUM('whatsapp','email','phone','sms');
CREATE TYPE public.comm_direction AS ENUM('outbound','inbound');
CREATE TYPE public.comm_status AS ENUM('sent','delivered','read','failed','pending');

CREATE TABLE public.communication_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES public.enea_practices(id) ON DELETE CASCADE,
  channel comm_channel NOT NULL,
  direction comm_direction NOT NULL DEFAULT 'outbound',
  recipient TEXT NOT NULL,
  subject TEXT,
  body_preview TEXT,
  status comm_status DEFAULT 'pending',
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ,
  n8n_execution_id TEXT,
  wa_message_id TEXT,
  resend_email_id TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.communication_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users full access on comm_log"
  ON public.communication_log FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()));

CREATE POLICY "Resellers read own practice comm_log"
  ON public.communication_log FOR SELECT
  TO authenticated
  USING (
    practice_id IN (
      SELECT id FROM public.enea_practices
      WHERE reseller_id = public.get_reseller_company_id(auth.uid())
    )
  );

CREATE INDEX idx_comm_log_practice ON public.communication_log(practice_id);
CREATE INDEX idx_comm_log_channel ON public.communication_log(channel, sent_at);
CREATE INDEX idx_comm_log_status ON public.communication_log(status);
