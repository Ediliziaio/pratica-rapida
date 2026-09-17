-- Eccezione di collaudo TS Pay: autorizzabile soltanto per una pratica precisa.
-- Nessuna riga viene creata dalla migrazione; la modalità resta quindi inattiva.

ALTER TABLE public.cf_payment_orders
  ADD COLUMN IF NOT EXISTS is_test_payment boolean NOT NULL DEFAULT false;

ALTER TABLE public.cf_payment_orders
  DROP CONSTRAINT IF EXISTS cf_payment_orders_pricing_key_check;
ALTER TABLE public.cf_payment_orders
  ADD CONSTRAINT cf_payment_orders_pricing_key_check
  CHECK (pricing_key IN (
    'prezzo_cf_standard',
    'prezzo_cf_sima_home',
    'prezzo_servizio_catastale',
    'prezzo_test_pagamento'
  ));

CREATE TABLE IF NOT EXISTS public.cf_payment_test_overrides (
  practice_id uuid PRIMARY KEY REFERENCES public.enea_practices(id) ON DELETE CASCADE,
  expected_customer_name text NOT NULL,
  net_cents integer NOT NULL DEFAULT 82 CHECK (net_cents = 82),
  vat_percent numeric(5,2) NOT NULL DEFAULT 22 CHECK (vat_percent = 22),
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(expected_customer_name)) > 0),
  CHECK (expires_at > created_at)
);

COMMENT ON TABLE public.cf_payment_test_overrides IS
  'Eccezioni monouso, service-role only, per collaudare TS Pay su una pratica esatta a 1 EUR IVA inclusa.';

ALTER TABLE public.cf_payment_test_overrides ENABLE ROW LEVEL SECURITY;

-- Intenzionalmente nessuna policy: browser anonimo e utenti autenticati non
-- possono leggere, creare o modificare le eccezioni. Opera soltanto service_role.
