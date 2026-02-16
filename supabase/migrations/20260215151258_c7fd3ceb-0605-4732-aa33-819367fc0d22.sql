
-- =============================================
-- PHASE 3: Wallet Ledger & Credit Functions
-- =============================================

-- Movement type enum
CREATE TYPE public.movimento_tipo AS ENUM ('credito', 'debito');

-- Wallet movements (ledger)
CREATE TABLE public.wallet_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo movimento_tipo NOT NULL,
  importo NUMERIC(10,2) NOT NULL,
  causale TEXT NOT NULL DEFAULT '',
  pratica_id UUID REFERENCES public.pratiche(id) ON DELETE SET NULL,
  eseguito_da UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_movements ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_wallet_movements_company ON public.wallet_movements(company_id);

-- RLS: company users see their movements, super admin sees all
CREATE POLICY "Users see own company movements"
  ON public.wallet_movements FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

CREATE POLICY "Super admin inserts movements"
  ON public.wallet_movements FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

-- Function: top-up wallet (super admin only — called from edge function or direct)
CREATE OR REPLACE FUNCTION public.wallet_topup(
  _company_id UUID,
  _importo NUMERIC,
  _causale TEXT,
  _user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert credit movement
  INSERT INTO public.wallet_movements (company_id, tipo, importo, causale, eseguito_da)
  VALUES (_company_id, 'credito', _importo, _causale, _user_id);
  
  -- Update company balance
  UPDATE public.companies
  SET wallet_balance = wallet_balance + _importo
  WHERE id = _company_id;
END;
$$;

-- Function: deduct from wallet (for practice submission)
CREATE OR REPLACE FUNCTION public.wallet_deduct(
  _company_id UUID,
  _importo NUMERIC,
  _pratica_id UUID,
  _user_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance NUMERIC;
BEGIN
  -- Check balance
  SELECT wallet_balance INTO _balance FROM public.companies WHERE id = _company_id FOR UPDATE;
  
  IF _balance < _importo THEN
    RETURN false;
  END IF;
  
  -- Insert debit movement
  INSERT INTO public.wallet_movements (company_id, tipo, importo, causale, pratica_id, eseguito_da)
  VALUES (_company_id, 'debito', _importo, 'Pagamento pratica', _pratica_id, _user_id);
  
  -- Update balance
  UPDATE public.companies
  SET wallet_balance = wallet_balance - _importo
  WHERE id = _company_id;
  
  RETURN true;
END;
$$;

-- Function: refund (super admin)
CREATE OR REPLACE FUNCTION public.wallet_refund(
  _company_id UUID,
  _importo NUMERIC,
  _pratica_id UUID,
  _causale TEXT,
  _user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallet_movements (company_id, tipo, importo, causale, pratica_id, eseguito_da)
  VALUES (_company_id, 'credito', _importo, COALESCE(_causale, 'Rimborso'), _pratica_id, _user_id);
  
  UPDATE public.companies
  SET wallet_balance = wallet_balance + _importo
  WHERE id = _company_id;
  
  -- Update pratica payment status if linked
  IF _pratica_id IS NOT NULL THEN
    UPDATE public.pratiche SET pagamento_stato = 'rimborsata' WHERE id = _pratica_id;
  END IF;
END;
$$;
