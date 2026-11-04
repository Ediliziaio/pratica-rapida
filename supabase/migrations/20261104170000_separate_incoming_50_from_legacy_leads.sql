-- Separa fisicamente i nuovi lead dell'offerta €50 dallo storico "Nuovo Lead".
-- Nessun vecchio lead viene prezzato o iscritto al percorso automatico.

-- Sposta nella nuova colonna soltanto la coorte certa: modulo Meta autorizzato,
-- data successiva all'avvio dell'offerta e prezzo commerciale già registrato a 50.
UPDATE public.leads
SET stage_id = 'lead_50_incoming',
    updated_at = now()
WHERE stage_id = 'lead'
  AND commercial_price_eur = 50
  AND meta_form_id = '2546968312490707'
  AND COALESCE(meta_created_at, created_at) >= timestamptz '2026-10-31 00:00:00+01';

-- Ripristina la colonna generica storica e mantiene a sinistra soltanto le due
-- fasi dedicate all'offerta €50.
WITH existing AS (
  SELECT COALESCE(
    (SELECT value FROM public.platform_settings WHERE key = 'crm_pipeline_stages'),
    '[]'::jsonb
  ) AS stages
), normalized AS (
  SELECT jsonb_build_array(
    jsonb_build_object('id','lead_50_incoming','name','Lead €50 in entrata','color','#0ea5e9','order',0),
    jsonb_build_object('id','clienti_50','name','Lead €50 contattati','color','#16a34a','order',1),
    jsonb_build_object('id','lead','name','Nuovo Lead','color','#6366f1','order',2)
  ) || COALESCE((
    SELECT jsonb_agg(
      (stage - 'order') || jsonb_build_object('order', filtered_order + 2)
      ORDER BY filtered_order
    )
    FROM (
      SELECT stage, row_number() OVER (ORDER BY ordinality) AS filtered_order
      FROM existing,
        jsonb_array_elements(stages) WITH ORDINALITY AS item(stage, ordinality)
      WHERE stage->>'id' NOT IN ('lead_50_incoming', 'clienti_50', 'lead')
    ) ordered_rest
  ), '[]'::jsonb) AS stages
)
INSERT INTO public.platform_settings(key, value)
SELECT 'crm_pipeline_stages', stages FROM normalized
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- Il trigger esistente continua ad avviare il percorso soltanto quando il
-- Titolare sposta manualmente un lead in "Lead €50 contattati".
