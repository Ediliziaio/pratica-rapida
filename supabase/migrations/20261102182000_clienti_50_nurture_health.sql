-- Verifica interna sul CRM reale dopo il primo ciclo automatico.
-- Non espone funzioni o dati all'esterno: se manca una consegna reale o
-- compare un invio fuori perimetro, il rilascio viene bloccato.

DO $$
DECLARE
  v_enabled boolean := false;
  v_activated_at timestamptz;
  v_candidates integer := 0;
  v_sent integer := 0;
  v_failed integer := 0;
  v_out_of_scope integer := 0;
BEGIN
  SELECT COALESCE((value ->> 'enabled')::boolean, false)
  INTO v_enabled
  FROM public.platform_settings
  WHERE key = 'lead_nurture_config';

  SELECT
    (value ->> 'activated_at')::timestamptz,
    COALESCE((value ->> 'candidate_count')::integer, 0)
  INTO v_activated_at, v_candidates
  FROM public.platform_settings
  WHERE key = 'lead_nurture_activation_audit';

  IF NOT v_enabled OR v_activated_at IS NULL THEN
    RAISE EXCEPTION 'Verifica nurture €50 fallita: automazione non attiva';
  END IF;
  IF v_candidates = 0 THEN
    RAISE EXCEPTION 'Verifica nurture €50 non conclusiva: nessun destinatario reale';
  END IF;

  SELECT count(*) FILTER (WHERE d.status = 'sent'),
         count(*) FILTER (WHERE d.status = 'failed'),
         count(*) FILTER (
           WHERE d.status = 'sent'
             AND (l.stage_id IS DISTINCT FROM 'clienti_50' OR l.archived_at IS NOT NULL)
         )
  INTO v_sent, v_failed, v_out_of_scope
  FROM public.lead_nurture_deliveries d
  JOIN public.leads l ON l.id = d.lead_id
  WHERE COALESCE(d.sent_at, d.attempted_at) >= v_activated_at;

  IF v_out_of_scope > 0 THEN
    RAISE EXCEPTION
      'Verifica nurture €50 fallita: % consegne fuori dalla pipeline Clienti €50',
      v_out_of_scope;
  END IF;
  IF v_failed > 0 THEN
    RAISE EXCEPTION
      'Verifica nurture €50 fallita: % consegne non riuscite',
      v_failed;
  END IF;
  IF v_sent = 0 THEN
    RAISE EXCEPTION
      'Verifica nurture €50 fallita: nessuna consegna reale registrata';
  END IF;

  INSERT INTO public.platform_settings(key, value)
  VALUES (
    'lead_nurture_live_verification',
    jsonb_build_object(
      'verified_at', now(),
      'status', 'healthy_delivery_recorded',
      'pipeline', 'clienti_50',
      'candidate_count', v_candidates,
      'sent_count', v_sent,
      'failed_count', v_failed,
      'out_of_scope_count', v_out_of_scope,
      'price_eur_ex_vat', 50
    )
  )
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();
END $$;

