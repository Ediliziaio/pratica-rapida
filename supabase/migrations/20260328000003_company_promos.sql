-- Extend promo_types with periodic_free fields
ALTER TABLE public.promo_types
  ADD COLUMN IF NOT EXISTS ciclo_pratiche INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS free_per_ciclo INT DEFAULT NULL;

-- Drop and recreate type check to add periodic_free
ALTER TABLE public.promo_types DROP CONSTRAINT IF EXISTS promo_types_type_check;
ALTER TABLE public.promo_types ADD CONSTRAINT promo_types_type_check
  CHECK (type IN ('free_pratiche','discount_percent','discount_fixed','periodic_free'));

-- Company-level promo assignments
CREATE TABLE IF NOT EXISTS public.company_promos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  promo_type_id UUID NOT NULL REFERENCES public.promo_types(id) ON DELETE RESTRICT,
  pratiche_rimaste INT DEFAULT NULL,
  ciclo_posizione INT DEFAULT 0,
  pratiche_usate INT DEFAULT 0,
  pratiche_gratuite_erogate INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','expired','exhausted')),
  activated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT NULL,
  note TEXT NOT NULL DEFAULT '',
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, promo_type_id)
);
ALTER TABLE public.company_promos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages company promos"
  ON public.company_promos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Internal view company promos"
  ON public.company_promos FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

CREATE POLICY "Company users view own promos"
  ON public.company_promos FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.get_user_company_ids(auth.uid())));

CREATE TRIGGER update_company_promos_updated_at
  BEFORE UPDATE ON public.company_promos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
