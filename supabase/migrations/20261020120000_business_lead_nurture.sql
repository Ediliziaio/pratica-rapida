-- Nurturing commerciale B2B riservato alla pipeline Clienti €50: invii
-- idempotenti e stop immediato quando il lead esce dalla pipeline.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent_source text;

CREATE TABLE IF NOT EXISTS public.lead_nurture_enrollments (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'sending', 'paused', 'completed', 'stopped')),
  next_step smallint NOT NULL DEFAULT 0 CHECK (next_step >= 0),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  promotion_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  stopped_at timestamptz,
  stop_reason text,
  opt_out_token uuid NOT NULL DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_nurture_enrollments
  ADD COLUMN IF NOT EXISTS promotion_expires_at timestamptz
  NOT NULL DEFAULT (now() + interval '30 days');

CREATE UNIQUE INDEX IF NOT EXISTS lead_nurture_opt_out_token_idx
  ON public.lead_nurture_enrollments(opt_out_token);
CREATE INDEX IF NOT EXISTS lead_nurture_due_idx
  ON public.lead_nurture_enrollments(next_run_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.lead_nurture_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  step_index smallint NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  status text NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  attempts smallint NOT NULL DEFAULT 1,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  provider_id text,
  error_message text,
  UNIQUE (lead_id, step_index, channel)
);

ALTER TABLE public.lead_nurture_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_nurture_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage lead nurture enrollments"
  ON public.lead_nurture_enrollments FOR ALL TO authenticated
  USING (public.is_internal(auth.uid()))
  WITH CHECK (public.is_internal(auth.uid()));
CREATE POLICY "Staff read lead nurture deliveries"
  ON public.lead_nurture_deliveries FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

CREATE OR REPLACE FUNCTION public.sync_lead_nurture_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.marketing_consent = true THEN
    IF TG_OP = 'INSERT' AND NEW.marketing_consent_at IS NULL THEN
      NEW.marketing_consent_at := now();
    ELSIF TG_OP = 'UPDATE' AND (OLD.marketing_consent = false OR NEW.marketing_consent_at IS NULL) THEN
      NEW.marketing_consent_at := now();
    END IF;
  END IF;

  IF NEW.archived_at IS NOT NULL OR NEW.stage_id <> 'clienti_50' THEN
    UPDATE public.lead_nurture_enrollments
      SET status = 'stopped', stopped_at = now(),
          stop_reason = CASE
            WHEN NEW.archived_at IS NOT NULL THEN 'lead_archived'
            ELSE 'left_clienti_50_pipeline'
          END,
          updated_at = now()
      WHERE lead_id = NEW.id AND status IN ('active', 'sending', 'paused');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_nurture_sync_before_write ON public.leads;
CREATE TRIGGER leads_nurture_sync_before_write
  BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_nurture_enrollment();

CREATE OR REPLACE FUNCTION public.enroll_clienti_50_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage_id = 'clienti_50' AND NEW.archived_at IS NULL THEN
    INSERT INTO public.lead_nurture_enrollments(lead_id, status, next_step, next_run_at)
    VALUES (NEW.id, 'active', 0, now())
    ON CONFLICT (lead_id) DO UPDATE SET
      status = 'active', next_step = 0, next_run_at = now(),
      started_at = now(), promotion_expires_at = now() + interval '30 days',
      stopped_at = NULL, stop_reason = NULL, updated_at = now()
    WHERE lead_nurture_enrollments.stop_reason IS DISTINCT FROM 'recipient_opt_out';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_nurture_enroll_after_write ON public.leads;
DROP TRIGGER IF EXISTS leads_nurture_enroll_after_insert ON public.leads;
CREATE TRIGGER leads_nurture_enroll_after_insert
  AFTER INSERT ON public.leads FOR EACH ROW
  WHEN (NEW.stage_id = 'clienti_50' AND NEW.archived_at IS NULL)
  EXECUTE FUNCTION public.enroll_clienti_50_lead();

DROP TRIGGER IF EXISTS leads_nurture_enroll_after_consent ON public.leads;
DROP TRIGGER IF EXISTS leads_nurture_enroll_after_stage ON public.leads;
CREATE TRIGGER leads_nurture_enroll_after_stage
  AFTER UPDATE OF stage_id ON public.leads FOR EACH ROW
  WHEN (NEW.stage_id = 'clienti_50' AND OLD.stage_id IS DISTINCT FROM 'clienti_50' AND NEW.archived_at IS NULL)
  EXECUTE FUNCTION public.enroll_clienti_50_lead();

-- Prepara, a configurazione ancora disattivata, i lead già presenti nella
-- pipeline dedicata. Nessun cliente o lead di altre pipeline viene iscritto.
INSERT INTO public.lead_nurture_enrollments(lead_id, status, next_step, next_run_at)
SELECT id, 'active', 0, now()
FROM public.leads
WHERE stage_id = 'clienti_50' AND archived_at IS NULL
ON CONFLICT (lead_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_due_lead_nurture(p_limit integer DEFAULT 20)
RETURNS TABLE(
  lead_id uuid, nome text, email text, telefono text, step_index smallint,
  opt_out_token uuid, started_at timestamptz, promotion_expires_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Recupera automaticamente soltanto claim tecnici rimasti orfani dopo un
  -- crash. Non riattiva mai una pausa causata dalla risposta del destinatario.
  UPDATE public.lead_nurture_enrollments
  SET status = 'active', updated_at = now()
  WHERE status = 'sending' AND updated_at < now() - interval '30 minutes';

  RETURN QUERY
  WITH due AS (
    SELECT e.lead_id
    FROM public.lead_nurture_enrollments e
    JOIN public.leads l ON l.id = e.lead_id
    WHERE e.status = 'active' AND e.next_run_at <= now()
      AND l.archived_at IS NULL
      AND l.stage_id = 'clienti_50'
    ORDER BY e.next_run_at
    FOR UPDATE OF e SKIP LOCKED
    LIMIT greatest(1, least(p_limit, 100))
  )
  UPDATE public.lead_nurture_enrollments e
    SET status = 'sending', updated_at = now()
  FROM due d, public.leads l
  WHERE e.lead_id = d.lead_id AND l.id = e.lead_id
  RETURNING e.lead_id, l.nome, l.email, l.telefono, e.next_step,
    e.opt_out_token, e.started_at, e.promotion_expires_at;
END $$;

REVOKE ALL ON FUNCTION public.claim_due_lead_nurture(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_lead_nurture(integer) TO service_role;

INSERT INTO public.platform_settings(key, value)
VALUES ('lead_nurture_config', '{"enabled":false,"duration_days":60}'::jsonb)
ON CONFLICT (key) DO NOTHING;

SELECT cron.unschedule('business-lead-nurture-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'business-lead-nurture-hourly');

SELECT cron.schedule('business-lead-nurture-hourly', '17 * * * *', $$
  SELECT net.http_post(
    url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/process-lead-nurture',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      )
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

COMMENT ON TABLE public.lead_nurture_enrollments IS
  'Sequenza B2B riservata esclusivamente ai lead della pipeline Clienti €50.';
