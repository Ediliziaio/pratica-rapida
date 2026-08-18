-- ============================================================
-- CRM Commerciale — coda attenzione lead (sola lettura)
-- Nessun messaggio o cambio di stato viene eseguito da questa vista.
-- ============================================================

CREATE OR REPLACE VIEW public.crm_lead_attention
WITH (security_invoker = true)
AS
SELECT
  l.id,
  l.nome,
  l.cognome,
  l.email,
  l.telefono,
  l.citta,
  l.source,
  l.stage_id,
  l.created_at,
  l.contacted_at,
  floor(extract(epoch FROM (now() - l.created_at)) / 3600)::integer AS age_hours,
  CASE
    WHEN l.contacted_at IS NULL THEN NULL
    ELSE floor(extract(epoch FROM (now() - l.contacted_at)) / 3600)::integer
  END AS hours_since_contact,
  CASE
    WHEN l.created_at > now()
      OR (l.contacted_at IS NOT NULL AND (l.contacted_at > now() OR l.contacted_at < l.created_at))
      THEN 'needs_data_review'
    WHEN l.stage_id NOT IN ('lead', 'contatto', 'demo', 'onboarding', 'attivo') THEN 'needs_stage_review'
    WHEN l.stage_id IN ('demo', 'onboarding', 'attivo') THEN 'progressing'
    WHEN l.contacted_at IS NULL AND l.created_at <= now() - interval '24 hours' THEN 'needs_first_contact'
    WHEN l.contacted_at IS NULL THEN 'new'
    WHEN l.stage_id IN ('lead', 'contatto')
      AND l.contacted_at <= now() - interval '72 hours' THEN 'needs_followup'
    ELSE 'no_action'
  END AS attention_status,
  CASE
    WHEN l.created_at > now()
      OR (l.contacted_at IS NOT NULL AND (l.contacted_at > now() OR l.contacted_at < l.created_at))
      THEN 70
    WHEN l.stage_id NOT IN ('lead', 'contatto', 'demo', 'onboarding', 'attivo') THEN 70
    WHEN l.stage_id IN ('demo', 'onboarding', 'attivo') THEN 10
    WHEN l.contacted_at IS NULL AND l.created_at <= now() - interval '24 hours' THEN 90
    WHEN l.contacted_at IS NULL THEN 60
    WHEN l.stage_id IN ('lead', 'contatto')
      AND l.contacted_at <= now() - interval '72 hours' THEN 70
    ELSE 20
  END AS attention_score
FROM public.leads l
WHERE l.archived_at IS NULL;

COMMENT ON VIEW public.crm_lead_attention IS
  'Coda read-only dei lead ordinabile per urgenza: primo contatto, follow-up, revisione dati temporali e revisione manuale delle fasi personalizzate, senza automazioni di invio.';
