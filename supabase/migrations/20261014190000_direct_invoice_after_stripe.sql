-- I nuovi checkout Stripe non creano piu' una proforma preventiva.
-- Gli snapshot rendono immutabili intestatario, righe e importi usati per
-- emettere la fattura definitiva soltanto dopo il pagamento verificato.
ALTER TABLE public.cf_payment_orders
  ADD COLUMN IF NOT EXISTS billing_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS product_snapshot text;

COMMENT ON COLUMN public.cf_payment_orders.billing_snapshot IS
  'Dati fiscali validati e congelati all''apertura del checkout Stripe.';
COMMENT ON COLUMN public.cf_payment_orders.pricing_snapshot IS
  'Righe e totali validati e congelati all''apertura del checkout Stripe.';
COMMENT ON COLUMN public.cf_payment_orders.product_snapshot IS
  'Descrizione prodotto congelata all''apertura del checkout Stripe.';
