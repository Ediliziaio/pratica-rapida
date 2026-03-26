-- =============================================
-- PRATICA RAPIDA v2.0 — Migration 001
-- Extend companies as resellers (add brand/block fields)
-- =============================================

-- Add rivenditore to existing role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'rivenditore';

-- Extend companies table with reseller-specific fields
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS brand_type TEXT[] DEFAULT ARRAY['enea'],
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- User-reseller link: store which company a 'rivenditore' user belongs to
-- Already handled by user_company_assignments, but add a convenience view
CREATE OR REPLACE VIEW public.resellers AS
  SELECT
    c.id,
    c.ragione_sociale AS name,
    c.email,
    c.telefono AS phone,
    c.ragione_sociale AS company_name,
    c.is_active,
    c.blocked_at,
    c.blocked_by,
    c.blocked_reason,
    c.brand_type,
    c.created_at,
    c.updated_at
  FROM public.companies c;

-- Check if a user is a reseller
CREATE OR REPLACE FUNCTION public.is_reseller(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'rivenditore'
  )
$$;

-- Get reseller's company id
CREATE OR REPLACE FUNCTION public.get_reseller_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.user_company_assignments
  WHERE user_id = _user_id
  LIMIT 1
$$;
