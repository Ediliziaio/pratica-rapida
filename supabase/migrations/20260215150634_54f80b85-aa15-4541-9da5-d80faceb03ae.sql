
-- =============================================
-- PHASE 1: Foundation Schema for Impresa Leggera
-- =============================================

-- 1. Role enum
CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'admin_interno',
  'operatore',
  'azienda_admin',
  'azienda_user',
  'partner'
);

-- 2. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  cognome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  telefono TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. User roles table (separate as required)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Companies (tenants)
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ragione_sociale TEXT NOT NULL,
  piva TEXT DEFAULT '',
  codice_fiscale TEXT DEFAULT '',
  indirizzo TEXT DEFAULT '',
  citta TEXT DEFAULT '',
  cap TEXT DEFAULT '',
  provincia TEXT DEFAULT '',
  settore TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  intestazione TEXT DEFAULT '',
  lingua TEXT NOT NULL DEFAULT 'it',
  wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 5. User-Company assignments (multi-tenant + operator assignments)
CREATE TABLE public.user_company_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);
ALTER TABLE public.user_company_assignments ENABLE ROW LEVEL SECURITY;

-- 6. Service categories enum
CREATE TYPE public.service_category AS ENUM (
  'fatturazione',
  'enea_bonus',
  'finanziamenti',
  'pratiche_edilizie',
  'altro'
);

-- 7. Service catalog
CREATE TABLE public.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria service_category NOT NULL,
  nome TEXT NOT NULL,
  descrizione TEXT DEFAULT '',
  prezzo_base NUMERIC(10,2) NOT NULL DEFAULT 0,
  varianti JSONB DEFAULT '[]'::jsonb,
  tempo_stimato_ore INTEGER DEFAULT 0,
  documenti_richiesti JSONB DEFAULT '[]'::jsonb,
  checklist_template JSONB DEFAULT '[]'::jsonb,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECURITY DEFINER FUNCTIONS
-- =============================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is internal (super_admin, admin_interno, operatore)
CREATE OR REPLACE FUNCTION public.is_internal(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin', 'admin_interno', 'operatore')
  )
$$;

-- Check if user belongs to a company
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_assignments
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

-- Get user's company IDs
CREATE OR REPLACE FUNCTION public.get_user_company_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.user_company_assignments
  WHERE user_id = _user_id
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Profiles: users see own, internals see all
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_internal(auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- User roles: super_admin manages, users see own
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin manages roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Companies: users see their assigned companies, internals see assigned
CREATE POLICY "Users see assigned companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

CREATE POLICY "Super admin manages companies"
  ON public.companies FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- User-Company assignments
CREATE POLICY "View own assignments"
  ON public.user_company_assignments FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Super admin manages assignments"
  ON public.user_company_assignments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Service catalog: everyone authenticated can read, super_admin manages
CREATE POLICY "Authenticated users can view active services"
  ON public.service_catalog FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admin manages catalog"
  ON public.service_catalog FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_service_catalog_updated_at
  BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, cognome)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    COALESCE(NEW.raw_user_meta_data->>'cognome', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
