-- Checkout Stripe diretto + fatturazione esclusivamente in Fatture in Cloud.
--
-- Il denaro viene incassato da Stripe; la proforma FIC rimane tecnica e non
-- viene mostrata al cliente. Solo dopo un evento Stripe firmato e verificato
-- viene creata la fattura, inviata allo SDI e spedita via e-mail. La pratica
-- entra in "pronte_da_fare" soltanto al termine di questi passaggi.

ALTER TABLE public.cf_payment_orders
  DROP CONSTRAINT IF EXISTS cf_payment_orders_provider_check;
ALTER TABLE public.cf_payment_orders
  ADD CONSTRAINT cf_payment_orders_provider_check
  CHECK (provider IN ('fatture_in_cloud_tspay', 'stripe_fatture_in_cloud'));

ALTER TABLE public.cf_payment_orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_url text,
  ADD COLUMN IF NOT EXISTS stripe_payment_status text,
  ADD COLUMN IF NOT EXISTS stripe_event_id text,
  ADD COLUMN IF NOT EXISTS invoice_email_requested_at timestamptz;

ALTER TABLE public.cf_payment_orders
  DROP CONSTRAINT IF EXISTS cf_payment_orders_status_check;
ALTER TABLE public.cf_payment_orders
  ADD CONSTRAINT cf_payment_orders_status_check
  CHECK (status IN (
    'creating', 'pending', 'paid', 'invoicing', 'invoice_created', 'sdi_sending', 'sdi_pending',
    'ready', 'completed', 'failed', 'refunded', 'cancelled'
  ));

CREATE INDEX IF NOT EXISTS idx_cf_payment_orders_stripe_session
  ON public.cf_payment_orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payment_order_id uuid REFERENCES public.cf_payment_orders(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'ignored', 'failed')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal users read Stripe webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Internal users read Stripe webhook events"
  ON public.stripe_webhook_events FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

-- Espone al titolare del form soltanto il link di checkout e lo stato sintetico.
-- Gli identificativi Stripe/FIC e gli errori tecnici rimangono privati.
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
  payment_url text,
  payment_is_test boolean
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
        AND lower(COALESCE(ep.dati_form->'catastali'->>'recupero_richiesto', 'false'))
          IN ('true', '1', 'si', 'sì', 'yes')
      ),
    po.status,
    COALESCE(po.stripe_checkout_url, po.fic_document_url),
    COALESCE(po.is_test_payment, test_override.practice_id IS NOT NULL)
  FROM public.enea_practices ep
  LEFT JOIN public.companies c ON c.id = ep.reseller_id
  LEFT JOIN public.cf_payment_orders po ON po.practice_id = ep.id
  LEFT JOIN public.cf_payment_test_overrides test_override
    ON test_override.practice_id = ep.id
   AND test_override.enabled = true
   AND (test_override.consumed_at IS NOT NULL OR test_override.expires_at > now())
  WHERE ep.form_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_practice_by_form_token(text) TO anon, authenticated;
