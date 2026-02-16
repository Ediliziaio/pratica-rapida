
-- Add new columns to fatture
ALTER TABLE public.fatture
  ADD COLUMN IF NOT EXISTS oggetto text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS metodo_pagamento text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS scadenza_pagamento date,
  ADD COLUMN IF NOT EXISTS lingua text NOT NULL DEFAULT 'it',
  ADD COLUMN IF NOT EXISTS valuta text NOT NULL DEFAULT 'EUR';

-- Add oggetto to proforma
ALTER TABLE public.proforma
  ADD COLUMN IF NOT EXISTS oggetto text NOT NULL DEFAULT '';

-- Create fattura_righe table
CREATE TABLE public.fattura_righe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fattura_id uuid NOT NULL REFERENCES public.fatture(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  codice text NOT NULL DEFAULT '',
  nome_prodotto text NOT NULL DEFAULT '',
  descrizione text NOT NULL DEFAULT '',
  quantita numeric NOT NULL DEFAULT 1,
  unita_misura text NOT NULL DEFAULT '',
  prezzo_netto numeric NOT NULL DEFAULT 0,
  sconto_pct numeric NOT NULL DEFAULT 0,
  aliquota_iva numeric NOT NULL DEFAULT 22,
  importo_totale numeric NOT NULL DEFAULT 0,
  ordine integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fattura_righe ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users see own company fattura_righe"
  ON public.fattura_righe FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR company_id IN (SELECT get_user_company_ids(auth.uid())));

CREATE POLICY "Company users create fattura_righe"
  ON public.fattura_righe FOR INSERT
  WITH CHECK (company_id IN (SELECT get_user_company_ids(auth.uid())));

CREATE POLICY "Company users update fattura_righe"
  ON public.fattura_righe FOR UPDATE
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR company_id IN (SELECT get_user_company_ids(auth.uid())));

CREATE POLICY "Company users delete fattura_righe"
  ON public.fattura_righe FOR DELETE
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR company_id IN (SELECT get_user_company_ids(auth.uid())));
