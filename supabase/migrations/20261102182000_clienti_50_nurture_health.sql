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
  v_active integer := 0;
  v_sending integer := 0;
  v_stopped integer := 0;
  v_cron_status text := 'missing';
  v_cron_started_at timestamptz;
  v_http_status integer;
  v_http_error text;
  v_http_reason text;
  v_http_processed integer;
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

  SELECT count(*) FILTER (WHERE e.status = 'active'),
         count(*) FILTER (WHERE e.status = 'sending'),
         count(*) FILTER (WHERE e.status = 'stopped')
  INTO v_active, v_sending, v_stopped
  FROM public.lead_nurture_enrollments e
  JOIN public.leads l ON l.id = e.lead_id
  WHERE l.stage_id = 'clienti_50' AND l.archived_at IS NULL;

  SELECT COALESCE(jrd.status, 'unknown'), jrd.start_time
  INTO v_cron_status, v_cron_started_at
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT status, start_time
    FROM cron.job_run_details r
    WHERE r.jobid = j.jobid
    ORDER BY r.start_time DESC
    LIMIT 1
  ) jrd ON true
  WHERE j.jobname = 'business-lead-nurture-hourly';

  -- pg_cron registra come riuscita la sola consegna della richiesta a pg_net.
  -- Leggiamo quindi anche la risposta HTTP prodotta subito dopo l'ultimo ciclo,
  -- riportando soltanto campi diagnostici aggregati e mai dati del destinatario.
  SELECT
    r.status_code,
    r.error_msg,
    CASE
      WHEN r.content ~ '^\s*\{' THEN (r.content::jsonb ->> 'reason')
      ELSE NULL
    END,
    CASE
      WHEN r.content ~ '^\s*\{' AND (r.content::jsonb ->> 'processed') ~ '^\d+$'
        THEN (r.content::jsonb ->> 'processed')::integer
      ELSE NULL
    END
  INTO v_http_status, v_http_error, v_http_reason, v_http_processed
  FROM net._http_response r
  WHERE v_cron_started_at IS NOT NULL
    AND r.created >= v_cron_started_at
    AND r.created < v_cron_started_at + interval '5 minutes'
  ORDER BY r.created ASC
  LIMIT 1;

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
      'Verifica nurture €50 fallita: nessuna consegna; candidati %, attivi %, in_invio %, fermati %, cron %, http %, motivo %, elaborati %, rete %',
      v_candidates, v_active, v_sending, v_stopped,
      COALESCE(v_cron_status, 'missing'), COALESCE(v_http_status::text, 'missing'),
      COALESCE(v_http_reason, 'missing'), COALESCE(v_http_processed::text, 'missing'),
      COALESCE(v_http_error, 'none');
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

