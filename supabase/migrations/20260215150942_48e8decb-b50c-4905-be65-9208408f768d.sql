
-- =============================================
-- PHASE 2: Clienti Finali, Pratiche, Documenti
-- =============================================

-- Practice status enum
CREATE TYPE public.pratica_stato AS ENUM (
  'bozza',
  'inviata',
  'in_lavorazione',
  'in_attesa_documenti',
  'completata',
  'annullata'
);

-- Practice payment status enum
CREATE TYPE public.pagamento_stato AS ENUM (
  'non_pagata',
  'pagata',
  'in_verifica',
  'rimborsata'
);

-- Practice priority enum
CREATE TYPE public.priorita AS ENUM (
  'bassa',
  'normale',
  'alta',
  'urgente'
);

-- Document visibility enum
CREATE TYPE public.visibilita_documento AS ENUM (
  'azienda_interno',
  'solo_interno'
);

-- 1. Clienti Finali
CREATE TABLE public.clienti_finali (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'persona',
  nome TEXT NOT NULL DEFAULT '',
  cognome TEXT NOT NULL DEFAULT '',
  ragione_sociale TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  indirizzo TEXT DEFAULT '',
  citta TEXT DEFAULT '',
  cap TEXT DEFAULT '',
  provincia TEXT DEFAULT '',
  codice_fiscale TEXT DEFAULT '',
  piva TEXT DEFAULT '',
  note TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  provenienza TEXT DEFAULT '',
  consenso_privacy BOOLEAN NOT NULL DEFAULT false,
  consenso_privacy_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clienti_finali ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_clienti_finali_company ON public.clienti_finali(company_id);

-- 2. Pratiche
CREATE TABLE public.pratiche (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.service_catalog(id),
  cliente_finale_id UUID REFERENCES public.clienti_finali(id),
  creato_da UUID NOT NULL REFERENCES auth.users(id),
  assegnatario_id UUID REFERENCES auth.users(id),
  titolo TEXT NOT NULL DEFAULT '',
  descrizione TEXT DEFAULT '',
  categoria service_category NOT NULL,
  stato pratica_stato NOT NULL DEFAULT 'bozza',
  priorita priorita NOT NULL DEFAULT 'normale',
  scadenza DATE,
  pagamento_stato pagamento_stato NOT NULL DEFAULT 'non_pagata',
  prezzo NUMERIC(10,2) NOT NULL DEFAULT 0,
  valuta TEXT NOT NULL DEFAULT 'EUR',
  dati_pratica JSONB DEFAULT '{}'::jsonb,
  note_consegna TEXT DEFAULT '',
  output_urls JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pratiche ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_pratiche_company ON public.pratiche(company_id);
CREATE INDEX idx_pratiche_stato ON public.pratiche(stato);
CREATE INDEX idx_pratiche_assegnatario ON public.pratiche(assegnatario_id);

-- 3. Documenti
CREATE TABLE public.documenti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pratica_id UUID REFERENCES public.pratiche(id) ON DELETE SET NULL,
  nome_file TEXT NOT NULL,
  tipo TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  size_bytes BIGINT DEFAULT 0,
  storage_path TEXT NOT NULL DEFAULT '',
  caricato_da UUID NOT NULL REFERENCES auth.users(id),
  visibilita visibilita_documento NOT NULL DEFAULT 'azienda_interno',
  versione INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documenti ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_documenti_pratica ON public.documenti(pratica_id);
CREATE INDEX idx_documenti_company ON public.documenti(company_id);

-- 4. Audit log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  pratica_id UUID REFERENCES public.pratiche(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  azione TEXT NOT NULL,
  dettagli JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Clienti Finali: tenant-isolated
CREATE POLICY "Users see own company clients"
  ON public.clienti_finali FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

CREATE POLICY "Company users manage own clients"
  ON public.clienti_finali FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

CREATE POLICY "Company users update own clients"
  ON public.clienti_finali FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

CREATE POLICY "Company users delete own clients"
  ON public.clienti_finali FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT public.get_user_company_ids(auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Pratiche: tenant-isolated + operator assignment
CREATE POLICY "Users see own company practices"
  ON public.pratiche FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

CREATE POLICY "Company users create practices"
  ON public.pratiche FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

CREATE POLICY "Authorized users update practices"
  ON public.pratiche FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.is_internal(auth.uid())
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

-- Documenti: tenant-isolated
CREATE POLICY "Users see own company documents"
  ON public.documenti FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR (
      company_id IN (SELECT public.get_user_company_ids(auth.uid()))
      AND (visibilita = 'azienda_interno' OR public.is_internal(auth.uid()))
    )
  );

CREATE POLICY "Company users upload documents"
  ON public.documenti FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

CREATE POLICY "Company users delete own documents"
  ON public.documenti FOR DELETE TO authenticated
  USING (
    caricato_da = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Audit log: read-only for authorized
CREATE POLICY "Authorized users view audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR (company_id IN (SELECT public.get_user_company_ids(auth.uid())))
  );

CREATE POLICY "System inserts audit log"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- =============================================
-- TRIGGERS
-- =============================================

CREATE TRIGGER update_clienti_finali_updated_at
  BEFORE UPDATE ON public.clienti_finali
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pratiche_updated_at
  BEFORE UPDATE ON public.pratiche
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
