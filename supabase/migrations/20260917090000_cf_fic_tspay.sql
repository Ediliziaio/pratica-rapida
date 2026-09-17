-- Pagamenti cliente finale tramite Fatture in Cloud + TS Pay.
--
-- Regole economiche approvate:
--   * CF ordinario: 150,00 + IVA 22% = 183,00 EUR
--   * CF Sima Home: 100,00 + IVA 22% = 122,00 EUR
--
-- La pratica CF compilata NON passa a "pronte_da_fare" finche il pagamento
-- non viene confermato dal webhook Fatture in Cloud. Gli effetti fiscali
-- (creazione/invio fattura elettronica) restano protetti anche da un flag
-- server-side nelle Edge Functions.

INSERT INTO public.platform_settings (key, value)
VALUES
  ('prezzo_cf_standard', '{"imponibile_cents":15000,"iva_percent":22,"attivo":true}'::jsonb),
  ('prezzo_cf_sima_home', '{"imponibile_cents":10000,"iva_percent":22,"attivo":true}'::jsonb),
  ('prezzo_servizio_catastale', '{"imponibile_cents":1000,"iva_percent":22,"attivo":true}'::jsonb),
  ('cf_sima_home_company_id', '{"company_id":"26796836-cc0e-4bfe-b3a5-0200b2098ed8"}'::jsonb),
  ('fic_tspay_rollout', '{"enabled":false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS "Anon reads public pricing" ON public.platform_settings;
CREATE POLICY "Anon reads public pricing"
  ON public.platform_settings FOR SELECT TO anon
  USING (key IN ('prezzo_privato_enea', 'prezzo_cf_standard', 'prezzo_cf_sima_home', 'prezzo_servizio_catastale'));

CREATE TABLE IF NOT EXISTS public.cf_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL UNIQUE REFERENCES public.enea_practices(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'fatture_in_cloud_tspay'
    CHECK (provider = 'fatture_in_cloud_tspay'),
  pricing_key text NOT NULL
    CHECK (pricing_key IN ('prezzo_cf_standard', 'prezzo_cf_sima_home', 'prezzo_servizio_catastale')),
  servizio_catastale boolean NOT NULL DEFAULT false,
  imponibile_cents integer NOT NULL CHECK (imponibile_cents > 0),
  iva_percent numeric(5,2) NOT NULL CHECK (iva_percent >= 0 AND iva_percent <= 100),
  totale_cents integer NOT NULL CHECK (totale_cents > 0),
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN (
      'creating', 'pending', 'paid', 'invoicing', 'invoice_created', 'sdi_sending', 'sdi_pending',
      'completed', 'failed', 'refunded', 'cancelled'
    )),
  fic_proforma_id bigint UNIQUE,
  fic_invoice_id bigint UNIQUE,
  fic_document_url text,
  fic_invoice_url text,
  paid_at timestamptz,
  invoice_created_at timestamptz,
  sdi_sent_at timestamptz,
  proforma_emailed_at timestamptz,
  customer_emailed_at timestamptz,
  last_error_code text,
  last_error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Compatibilità con un ambiente di collaudo sul quale una versione precedente
-- della migrazione può essere già stata applicata.
ALTER TABLE public.cf_payment_orders
  ADD COLUMN IF NOT EXISTS servizio_catastale boolean NOT NULL DEFAULT false;
ALTER TABLE public.cf_payment_orders
  DROP CONSTRAINT IF EXISTS cf_payment_orders_pricing_key_check;
ALTER TABLE public.cf_payment_orders
  ADD CONSTRAINT cf_payment_orders_pricing_key_check
  CHECK (pricing_key IN ('prezzo_cf_standard', 'prezzo_cf_sima_home', 'prezzo_servizio_catastale'));

COMMENT ON TABLE public.cf_payment_orders IS
  'Registro idempotente pratica CF -> proforma TS Pay -> pagamento -> fattura FIC/SDI.';

CREATE INDEX IF NOT EXISTS idx_cf_payment_orders_status
  ON public.cf_payment_orders(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_cf_payment_orders_proforma
  ON public.cf_payment_orders(fic_proforma_id) WHERE fic_proforma_id IS NOT NULL;

ALTER TABLE public.cf_payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal users read CF payment orders" ON public.cf_payment_orders;
CREATE POLICY "Internal users read CF payment orders"
  ON public.cf_payment_orders FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

CREATE TABLE IF NOT EXISTS public.fic_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  subject text,
  resource_ids bigint[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'ignored', 'failed')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.fic_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal users read FIC webhook events" ON public.fic_webhook_events;
CREATE POLICY "Internal users read FIC webhook events"
  ON public.fic_webhook_events FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

-- Dati pubblici minimi necessari per mostrare al titolare del token lo stato
-- del pagamento. Nessun ID FIC viene esposto al browser.
-- Il tipo di ritorno viene ampliato con i campi del pagamento: PostgreSQL non
-- consente di cambiarlo con CREATE OR REPLACE, quindi la funzione va ricreata.
DROP FUNCTION IF EXISTS public.get_practice_by_form_token(text);
CREATE OR REPLACE FUNCTION public.get_practice_by_form_token(p_token text)
RETURNS TABLE (
  id uuid,
  brand text,
  current_stage_id uuid,
  cliente_nome text,
  cliente_cognome text,
  cliente_email text,
  cliente_telefono text,
  cliente_indirizzo text,
  cliente_cf text,
  note text,
  form_compilato_at timestamptz,
  archived_at timestamptz,
  reseller_id uuid,
  reseller_name text,
  prodotto_installato text,
  dati_form jsonb,
  tipo_fatturazione text,
  pagamento_stato text,
  payment_required boolean,
  payment_status text,
  payment_url text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    ep.id,
    ep.brand::text,
    ep.current_stage_id,
    ep.cliente_nome,
    ep.cliente_cognome,
    ep.cliente_email,
    ep.cliente_telefono,
    ep.cliente_indirizzo,
    ep.cliente_cf,
    ep.note,
    ep.form_compilato_at,
    ep.archived_at,
    ep.reseller_id,
    c.ragione_sociale,
    ep.prodotto_installato,
    COALESCE(ep.dati_form, '{}'::jsonb),
    ep.tipo_fatturazione,
    ep.pagamento_stato::text,
    ep.tipo_fatturazione = 'cliente_finale'
      OR (
        COALESCE((SELECT (ps.value->>'enabled')::boolean
                  FROM public.platform_settings ps
                  WHERE ps.key = 'fic_tspay_rollout'), false)
        AND lower(COALESCE(ep.dati_form->'catastali'->>'recupero_richiesto', 'false')) IN ('true', '1', 'si', 'sì', 'yes')
      ),
    po.status,
    po.fic_document_url
  FROM public.enea_practices ep
  LEFT JOIN public.companies c ON c.id = ep.reseller_id
  LEFT JOIN public.cf_payment_orders po ON po.practice_id = ep.id
  WHERE ep.form_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_practice_by_form_token(text) TO anon, authenticated;

-- Il form CF viene salvato definitivamente, ma rimane nello stage corrente.
-- Sarà il webhook di pagamento verificato a spostarlo in pronte_da_fare.
CREATE OR REPLACE FUNCTION public.submit_form_by_token(
  p_token text,
  p_cliente_nome text,
  p_cliente_cognome text,
  p_cliente_email text,
  p_cliente_telefono text,
  p_cliente_indirizzo text,
  p_cliente_cf text,
  p_note text,
  p_dati_form jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_practice_id uuid;
  v_brand text;
  v_tipo_fatturazione text;
  v_pagamento_stato public.pagamento_stato;
  v_stage_id uuid;
  v_has_fatture_urls boolean;
  v_recupero_catastale boolean;
  v_rollout_enabled boolean;
  v_payment_required boolean;
BEGIN
  SELECT id, brand::text, tipo_fatturazione, pagamento_stato
    INTO v_practice_id, v_brand, v_tipo_fatturazione, v_pagamento_stato
  FROM public.enea_practices
  WHERE form_token = p_token
    AND archived_at IS NULL
    AND form_compilato_at IS NULL
  LIMIT 1;

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'Pratica non trovata, archiviata o già compilata'
      USING ERRCODE = 'P0002';
  END IF;

  IF (p_dati_form ? 'documenti')
     AND COALESCE(p_dati_form->'documenti'->>'fattura_url', '') = ''
  THEN
    SELECT COALESCE(array_length(fatture_urls, 1), 0) > 0
      INTO v_has_fatture_urls
    FROM public.enea_practices
    WHERE id = v_practice_id;

    IF NOT COALESCE(v_has_fatture_urls, false) THEN
      RAISE EXCEPTION 'Fattura obbligatoria: carica la fattura prima di inviare il modulo'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_recupero_catastale := lower(COALESCE(p_dati_form->'catastali'->>'recupero_richiesto', 'false'))
    IN ('true', '1', 'si', 'sì', 'yes');
  SELECT COALESCE((value->>'enabled')::boolean, false)
    INTO v_rollout_enabled
  FROM public.platform_settings
  WHERE key = 'fic_tspay_rollout';
  v_rollout_enabled := COALESCE(v_rollout_enabled, false);
  v_payment_required := v_tipo_fatturazione = 'cliente_finale'
    OR (v_rollout_enabled AND v_recupero_catastale);

  IF NOT v_recupero_catastale AND (
    COALESCE(trim(p_dati_form->'catastali'->>'foglio'), '') = '' OR
    COALESCE(trim(p_dati_form->'catastali'->>'mappale'), '') = ''
  ) THEN
    RAISE EXCEPTION 'Dati catastali obbligatori: inserisci foglio e mappale oppure richiedi il servizio di ricerca'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_recupero_catastale AND (
    COALESCE(trim(p_dati_form->'catastali'->>'proprietario_nome'), '') = '' OR
    COALESCE(trim(p_dati_form->'catastali'->>'proprietario_cognome'), '') = '' OR
    COALESCE(trim(p_dati_form->'catastali'->>'proprietario_cf'), '') = ''
  ) THEN
    RAISE EXCEPTION 'Per la ricerca catastale servono nome, cognome e codice fiscale del proprietario'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_payment_required OR v_pagamento_stato = 'pagata' THEN
    SELECT id INTO v_stage_id
    FROM public.pipeline_stages
    WHERE reseller_id IS NULL
      AND stage_type = 'pronte_da_fare'
      AND brand = v_brand
    LIMIT 1;
  END IF;

  UPDATE public.enea_practices
  SET
    cliente_nome = COALESCE(NULLIF(p_cliente_nome, ''), cliente_nome),
    cliente_cognome = COALESCE(NULLIF(p_cliente_cognome, ''), cliente_cognome),
    cliente_email = NULLIF(p_cliente_email, ''),
    cliente_telefono = NULLIF(p_cliente_telefono, ''),
    cliente_indirizzo = NULLIF(p_cliente_indirizzo, ''),
    cliente_cf = NULLIF(upper(p_cliente_cf), ''),
    note = NULLIF(p_note, ''),
    dati_form = COALESCE(p_dati_form, '{}'::jsonb),
    form_compilato_at = now(),
    current_stage_id = CASE
      WHEN v_payment_required AND v_pagamento_stato IS DISTINCT FROM 'pagata'::public.pagamento_stato THEN current_stage_id
      ELSE COALESCE(v_stage_id, current_stage_id)
    END,
    pagamento_stato = CASE
      WHEN v_payment_required AND v_pagamento_stato IS DISTINCT FROM 'pagata'::public.pagamento_stato THEN 'non_pagata'::public.pagamento_stato
      ELSE pagamento_stato
    END
  WHERE id = v_practice_id;

  RETURN v_practice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_form_by_token(text, text, text, text, text, text, text, text, jsonb) TO anon, authenticated;
