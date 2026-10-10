-- Follow-up isolati per i SOLI privati provenienti dai moduli Meta.
-- Non usa automation_rules e non coinvolge le pratiche già presenti nel CRM.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meta_leadgen_id text,
  ADD COLUMN IF NOT EXISTS meta_form_id text,
  ADD COLUMN IF NOT EXISTS meta_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_field_data jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS leads_meta_leadgen_id_unique
  ON public.leads(meta_leadgen_id)
  WHERE meta_leadgen_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.meta_private_lead_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  followup_day smallint NOT NULL CHECK (followup_day IN (1, 4)),
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled_completed')),
  claimed_at timestamptz,
  sent_at timestamptz,
  wa_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, followup_day)
);

CREATE INDEX IF NOT EXISTS meta_private_followups_due_idx
  ON public.meta_private_lead_followups(due_on, status)
  WHERE status = 'pending';

ALTER TABLE public.meta_private_lead_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read Meta private followups" ON public.meta_private_lead_followups;
CREATE POLICY "Staff read Meta private followups"
  ON public.meta_private_lead_followups FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'operatore'::app_role)
  );

CREATE OR REPLACE FUNCTION public.touch_meta_private_lead_followup()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meta_private_followups_updated_at
  ON public.meta_private_lead_followups;
CREATE TRIGGER meta_private_followups_updated_at
  BEFORE UPDATE ON public.meta_private_lead_followups
  FOR EACH ROW EXECUTE FUNCTION public.touch_meta_private_lead_followup();

-- Crea esattamente due scadenze. Viene chiamata solo dal webhook Meta dopo
-- avere verificato la risposta esplicita "sono un privato".
CREATE OR REPLACE FUNCTION public.schedule_meta_private_lead_followups(
  p_lead_id uuid,
  p_meta_created_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_date date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = p_lead_id AND source = 'meta_ads'
  ) THEN
    RAISE EXCEPTION 'lead_not_from_meta';
  END IF;

  v_base_date := (COALESCE(p_meta_created_at, now()) AT TIME ZONE 'Europe/Rome')::date;
  INSERT INTO public.meta_private_lead_followups (lead_id, followup_day, due_on)
  VALUES
    (p_lead_id, 1, v_base_date + 1),
    (p_lead_id, 4, v_base_date + 4)
  ON CONFLICT (lead_id, followup_day) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_meta_private_lead_followups(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_meta_private_lead_followups(uuid, timestamptz) TO service_role;

-- Claim atomico. Prima annulla TUTTI i promemoria del lead se il privato ha
-- già completato il form. Il match è su telefono normalizzato oppure e-mail,
-- solo per pratiche CF create dopo il lead Meta.
CREATE OR REPLACE FUNCTION public.claim_due_meta_private_followups(p_limit integer DEFAULT 25)
RETURNS TABLE (
  followup_id uuid,
  lead_id uuid,
  followup_day smallint,
  nome text,
  telefono text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.meta_private_lead_followups f
  SET status = 'cancelled_completed', error_message = NULL
  FROM public.leads l
  WHERE f.lead_id = l.id
    AND f.status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.enea_practices ep
      WHERE ep.tipo_fatturazione = 'cliente_finale'
        AND ep.created_at >= COALESCE(l.meta_created_at, l.created_at) - interval '2 hours'
        AND (
          (l.email IS NOT NULL AND ep.cliente_email IS NOT NULL
            AND lower(trim(ep.cliente_email)) = lower(trim(l.email)))
          OR
          (l.telefono IS NOT NULL AND ep.cliente_telefono IS NOT NULL
            AND right(regexp_replace(ep.cliente_telefono, '\\D', '', 'g'), 9)
              = right(regexp_replace(l.telefono, '\\D', '', 'g'), 9)
            AND length(regexp_replace(l.telefono, '\\D', '', 'g')) >= 9)
        )
    );

  RETURN QUERY
  WITH due AS (
    SELECT f.id
    FROM public.meta_private_lead_followups f
    JOIN public.leads l ON l.id = f.lead_id
    WHERE f.status = 'pending'
      AND f.due_on <= (now() AT TIME ZONE 'Europe/Rome')::date
      AND l.source = 'meta_ads'
      AND l.telefono IS NOT NULL
      AND length(regexp_replace(l.telefono, '\\D', '', 'g')) >= 9
    ORDER BY f.due_on, f.created_at
    FOR UPDATE OF f SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  ), claimed AS (
    UPDATE public.meta_private_lead_followups f
    SET status = 'sending', claimed_at = now(), error_message = NULL
    FROM due
    WHERE f.id = due.id
    RETURNING f.id, f.lead_id, f.followup_day
  )
  SELECT c.id, c.lead_id, c.followup_day, l.nome, l.telefono
  FROM claimed c
  JOIN public.leads l ON l.id = c.lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_meta_private_followups(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_meta_private_followups(integer) TO service_role;

-- Il cron gira ogni ora; la Edge Function applica le fasce Europe/Rome e
-- fuori fascia non effettua alcun invio.
SELECT cron.unschedule('meta-private-lead-followups-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-private-lead-followups-hourly');

SELECT cron.schedule('meta-private-lead-followups-hourly', '37 * * * *', $$
  SELECT net.http_post(
    url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/process-meta-private-followups',
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
