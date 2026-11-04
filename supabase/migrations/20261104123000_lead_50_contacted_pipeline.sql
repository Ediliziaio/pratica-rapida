-- Percorso commerciale €50 autorizzato dal Titolare il 4 novembre 2026.
-- I lead dell'offerta entrano nella prima colonna. Il percorso automatico
-- parte soltanto dopo lo spostamento manuale nella seconda colonna.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS commercial_price_eur numeric(10,2)
  CHECK (commercial_price_eur IS NULL OR commercial_price_eur >= 0);

COMMENT ON COLUMN public.leads.commercial_price_eur IS
  'Prezzo commerciale proposto al lead. Mantiene visibile la coorte anche dopo lo spostamento di fase.';

-- Identifica soltanto la coorte già autorizzata: lead del modulo Meta €50 e
-- lead già collocati manualmente nella vecchia colonna Clienti €50.
UPDATE public.leads
SET commercial_price_eur = 50
WHERE commercial_price_eur IS NULL
  AND (
    stage_id = 'clienti_50'
    OR (
      meta_form_id = '2546968312490707'
      AND COALESCE(meta_created_at, created_at) >= timestamptz '2026-10-31 00:00:00+01'
    )
  );

-- Lo spostamento manuale nella colonna dei contattati registra sia il prezzo
-- sia il momento del contatto. Uscire dalla colonna continua a fermare subito
-- l'automatismo, come già previsto dalla regola esistente.
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

  IF TG_OP = 'UPDATE'
     AND NEW.stage_id = 'clienti_50'
     AND OLD.stage_id IS DISTINCT FROM 'clienti_50' THEN
    NEW.commercial_price_eur := COALESCE(NEW.commercial_price_eur, 50);
    NEW.contacted_at := COALESCE(NEW.contacted_at, now());
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

-- Aggiorna soltanto la configurazione visiva delle fasi. Nessun lead viene
-- spostato e nessun cliente esistente viene modificato.
WITH existing AS (
  SELECT COALESCE(
    (SELECT value FROM public.platform_settings WHERE key = 'crm_pipeline_stages'),
    '[]'::jsonb
  ) AS stages
), normalized AS (
  SELECT jsonb_build_array(
    jsonb_build_object('id','lead','name','Lead €50 in entrata','color','#0ea5e9','order',0),
    jsonb_build_object('id','clienti_50','name','Lead €50 contattati','color','#16a34a','order',1)
  ) || COALESCE((
    SELECT jsonb_agg(
      (stage - 'order') || jsonb_build_object('order', ordinality + 1)
      ORDER BY ordinality
    )
    FROM existing,
      jsonb_array_elements(stages) WITH ORDINALITY AS item(stage, ordinality)
    WHERE stage->>'id' NOT IN ('lead', 'clienti_50')
  ), '[]'::jsonb) AS stages
)
INSERT INTO public.platform_settings(key, value)
SELECT 'crm_pipeline_stages', stages FROM normalized
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- La configurazione, le iscrizioni e la coda degli automatismi esistenti non
-- vengono modificate. Per i nuovi lead, il trigger già installato continuerà
-- ad attivarsi soltanto entrando manualmente in "Lead €50 contattati".

