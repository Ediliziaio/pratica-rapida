-- =============================================
-- company_pricing: per-company price overrides
-- Brand values: 'enea' | 'conto_termico'
-- =============================================
CREATE TABLE IF NOT EXISTS public.company_pricing (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  brand       TEXT NOT NULL CHECK (brand IN ('enea', 'conto_termico')),
  prezzo      NUMERIC(10,2) NOT NULL CHECK (prezzo >= 0),
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, brand)
);

ALTER TABLE public.company_pricing ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist (idempotent)
DROP POLICY IF EXISTS "Super admin manages company pricing" ON public.company_pricing;
DROP POLICY IF EXISTS "Internal users view company pricing" ON public.company_pricing;
DROP POLICY IF EXISTS "Company users view own pricing" ON public.company_pricing;

-- Super admin: full access
CREATE POLICY "Super admin manages company pricing"
  ON public.company_pricing FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Internal users (admin_interno, operatore): read-only
CREATE POLICY "Internal users view company pricing"
  ON public.company_pricing FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

-- Company users: can read their own pricing (so NuovaPratica can fetch it)
CREATE POLICY "Company users view own pricing"
  ON public.company_pricing FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.get_user_company_ids(auth.uid())));

-- updated_at trigger (drop first to be idempotent)
DROP TRIGGER IF EXISTS update_company_pricing_updated_at ON public.company_pricing;
CREATE TRIGGER update_company_pricing_updated_at
  BEFORE UPDATE ON public.company_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
