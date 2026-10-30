-- Pipeline commerciale dedicata ai soli nuovi clienti con prezzo comunicato
-- di 50 euro. La migrazione modifica esclusivamente la configurazione delle
-- colonne: non assegna, non sposta e non aggiorna alcun cliente o lead.
DO $$
DECLARE
  current_stages jsonb;
  remaining_stages jsonb;
  normalized_stages jsonb;
BEGIN
  SELECT value
    INTO current_stages
    FROM public.platform_settings
   WHERE key = 'crm_pipeline_stages';

  IF current_stages IS NULL OR jsonb_typeof(current_stages) <> 'array' THEN
    normalized_stages := jsonb_build_array(
      jsonb_build_object('id', 'clienti_50', 'name', 'Clienti €50', 'color', '#16a34a', 'order', 0),
      jsonb_build_object('id', 'lead', 'name', 'Nuovo Lead', 'color', '#6366f1', 'order', 1),
      jsonb_build_object('id', 'contatto', 'name', 'Primo Contatto', 'color', '#f59e0b', 'order', 2),
      jsonb_build_object('id', 'demo', 'name', 'Demo Programmata', 'color', '#8b5cf6', 'order', 3),
      jsonb_build_object('id', 'onboarding', 'name', 'In Onboarding', 'color', '#3b82f6', 'order', 4),
      jsonb_build_object('id', 'attivo', 'name', 'Cliente Attivo', 'color', '#10b981', 'order', 5)
    );
  ELSE
    SELECT COALESCE(
      jsonb_agg(jsonb_set(stage, '{order}', to_jsonb(new_order), true) ORDER BY new_order),
      '[]'::jsonb
    )
      INTO remaining_stages
      FROM (
        SELECT stage,
               row_number() OVER (
                 ORDER BY COALESCE((stage ->> 'order')::integer, ordinality::integer), ordinality
               )::integer AS new_order
          FROM jsonb_array_elements(current_stages) WITH ORDINALITY AS item(stage, ordinality)
         WHERE stage ->> 'id' <> 'clienti_50'
      ) ordered_stages;

    normalized_stages := jsonb_build_array(
      jsonb_build_object('id', 'clienti_50', 'name', 'Clienti €50', 'color', '#16a34a', 'order', 0)
    ) || remaining_stages;
  END IF;

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES ('crm_pipeline_stages', normalized_stages, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();
END
$$;
