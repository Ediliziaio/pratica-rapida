-- =============================================
-- FASE 1: Tabelle Megaprompt
-- email_templates, email_logs, whatsapp_logs,
-- calendar_events, promo_types, client_promos,
-- + ALTER profiles + ALTER pratiche
-- =============================================

-- -----------------------------------------------
-- 1. EMAIL TEMPLATES
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  subject      TEXT NOT NULL,
  html_body    TEXT NOT NULL,
  trigger_event TEXT, -- 'pratica_created' | 'pratica_status_changed' | 'onboarding_welcome'
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manage email templates"
  ON public.email_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- -----------------------------------------------
-- 2. EMAIL LOGS
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  pratica_id  UUID REFERENCES public.pratiche(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  status      TEXT DEFAULT 'sent' CHECK (status IN ('sent','failed','bounced','opened')),
  resend_id   TEXT,
  sent_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin view email logs"
  ON public.email_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.is_internal(auth.uid()));

CREATE POLICY "System insert email logs"
  ON public.email_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- -----------------------------------------------
-- 3. WHATSAPP LOGS
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  pratica_id     UUID REFERENCES public.pratiche(id) ON DELETE SET NULL,
  direction      TEXT DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  phone          TEXT NOT NULL,
  message_type   TEXT DEFAULT 'template' CHECK (message_type IN ('template','text')),
  template_name  TEXT,
  body           TEXT,
  status         TEXT DEFAULT 'sent' CHECK (status IN ('sent','delivered','read','failed')),
  wa_message_id  TEXT,
  sent_at        TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manage whatsapp logs"
  ON public.whatsapp_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.is_internal(auth.uid()));

CREATE POLICY "System insert whatsapp logs"
  ON public.whatsapp_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- -----------------------------------------------
-- 4. CALENDAR EVENTS
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pratica_id      UUID REFERENCES public.pratiche(id) ON DELETE SET NULL,
  client_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  google_event_id TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  start_datetime  TIMESTAMPTZ NOT NULL,
  end_datetime    TIMESTAMPTZ NOT NULL,
  attendees       JSONB DEFAULT '[]',
  meet_link       TEXT,
  status          TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed','tentative','cancelled')),
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users manage calendar events"
  ON public.calendar_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.is_internal(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.is_internal(auth.uid()));

-- -----------------------------------------------
-- 5. PROMO TYPES (catalogo)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.promo_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  type          TEXT NOT NULL CHECK (type IN ('free_pratiche','discount_percent','discount_fixed')),
  value         DECIMAL(10,2),
  max_pratiche  INT,
  validity_days INT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.promo_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manage promo types"
  ON public.promo_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "All authenticated read promo types"
  ON public.promo_types FOR SELECT TO authenticated
  USING (is_active = true);

-- -----------------------------------------------
-- 6. CLIENT PROMOS (assegnazioni)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_promos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  promo_type_id         UUID REFERENCES public.promo_types(id) ON DELETE RESTRICT,
  activated_at          TIMESTAMPTZ DEFAULT now(),
  expires_at            TIMESTAMPTZ,
  pratiche_used         INT DEFAULT 0,
  pratiche_free_remaining INT,
  status                TEXT DEFAULT 'active' CHECK (status IN ('active','expired','exhausted')),
  assigned_by           UUID REFERENCES public.profiles(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.client_promos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manage client promos"
  ON public.client_promos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Client view own promos"
  ON public.client_promos FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- -----------------------------------------------
-- 7. ALTER profiles — onboarding + analytics
-- -----------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step       INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_name          TEXT,
  ADD COLUMN IF NOT EXISTS piva                  TEXT,
  ADD COLUMN IF NOT EXISTS address               TEXT,
  ADD COLUMN IF NOT EXISTS city                  TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact     TEXT DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS referral_source       TEXT,
  ADD COLUMN IF NOT EXISTS notes                 TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_pratiche_count  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_value        DECIMAL(10,2) DEFAULT 0;

-- -----------------------------------------------
-- 8. ALTER pratiche — is_free per promo
-- -----------------------------------------------
ALTER TABLE public.pratiche
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;

-- -----------------------------------------------
-- 9. Trigger last_login_at
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.update_last_login()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET last_login_at = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_sign_in ON auth.sessions;
CREATE TRIGGER on_auth_sign_in
  AFTER INSERT ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_last_login();

-- -----------------------------------------------
-- 10. Indici per performance
-- -----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_email_logs_client_id   ON public.email_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_pratica_id  ON public.email_logs(pratica_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at     ON public.email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_client_id ON public.whatsapp_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start  ON public.calendar_events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_client_promos_client_id ON public.client_promos(client_id);
CREATE INDEX IF NOT EXISTS idx_client_promos_status    ON public.client_promos(status);
