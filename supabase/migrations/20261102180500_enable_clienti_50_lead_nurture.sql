-- Attivazione controllata della sequenza commerciale riservata alla sola
-- pipeline "Clienti €50". L'operazione si interrompe prima dell'attivazione
-- se esiste anche un solo iscritto attivo fuori dal perimetro autorizzato.

DO $$
DECLARE
  v_invalid_recipients integer;
  v_candidates integer;
BEGIN
  SELECT count(*)
  INTO v_invalid_recipients
  FROM public.lead_nurture_enrollments e
  JOIN public.leads l ON l.id = e.lead_id
  WHERE e.status IN ('active', 'sending', 'paused')
    AND (l.stage_id IS DISTINCT FROM 'clienti_50' OR l.archived_at IS NOT NULL);

  IF v_invalid_recipients > 0 THEN
    RAISE EXCEPTION
      'Attivazione nurture €50 bloccata: % destinatari attivi fuori dalla pipeline Clienti €50',
      v_invalid_recipients;
  END IF;

  -- Completa l'iscrizione dei soli lead attualmente presenti nella pipeline.
  -- Il vincolo sull'opt-out resta applicato dal trigger per i movimenti futuri.
  INSERT INTO public.lead_nurture_enrollments(
    lead_id, status, next_step, next_run_at, started_at, promotion_expires_at
  )
  SELECT id, 'active', 0, now(), now(), now() + interval '30 days'
  FROM public.leads
  WHERE stage_id = 'clienti_50' AND archived_at IS NULL
  ON CONFLICT (lead_id) DO NOTHING;

  SELECT count(*)
  INTO v_candidates
  FROM public.lead_nurture_enrollments e
  JOIN public.leads l ON l.id = e.lead_id
  WHERE e.status = 'active'
    AND e.next_run_at <= now()
    AND l.stage_id = 'clienti_50'
    AND l.archived_at IS NULL;

  INSERT INTO public.platform_settings(key, value)
  VALUES (
    'lead_nurture_activation_audit',
    jsonb_build_object(
      'activated_at', now(),
      'pipeline', 'clienti_50',
      'candidate_count', v_candidates,
      'invalid_recipient_count', v_invalid_recipients,
      'price_eur_ex_vat', 50
    )
  )
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();

  INSERT INTO public.platform_settings AS ps(key, value)
  VALUES ('lead_nurture_config', '{"enabled":true,"duration_days":60}'::jsonb)
  ON CONFLICT (key) DO UPDATE
    SET value = COALESCE(ps.value, '{}'::jsonb)
      || '{"enabled":true,"duration_days":60}'::jsonb,
    updated_at = now();
END $$;

