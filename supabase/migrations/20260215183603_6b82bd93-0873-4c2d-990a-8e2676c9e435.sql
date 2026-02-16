
-- =============================================
-- FASE 5: Storage bucket documenti
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documenti', 'documenti', false);

-- Storage RLS: users can upload to their company folder
CREATE POLICY "Company users upload files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documenti'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Company users read files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documenti'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Company users delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documenti'
  AND auth.role() = 'authenticated'
);

-- =============================================
-- FASE 6: Fatturazione tables
-- =============================================
CREATE TYPE public.stato_fattura AS ENUM ('bozza', 'emessa', 'pagata');

CREATE TABLE public.fatture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  cliente_finale_id UUID REFERENCES public.clienti_finali(id),
  numero TEXT NOT NULL DEFAULT '',
  data_emissione DATE NOT NULL DEFAULT CURRENT_DATE,
  imponibile NUMERIC(10,2) NOT NULL DEFAULT 0,
  aliquota_iva NUMERIC(5,2) NOT NULL DEFAULT 22,
  iva NUMERIC(10,2) NOT NULL DEFAULT 0,
  totale NUMERIC(10,2) NOT NULL DEFAULT 0,
  stato public.stato_fattura NOT NULL DEFAULT 'bozza',
  xml_url TEXT DEFAULT '',
  pdf_url TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fatture ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own company fatture"
ON public.fatture FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Company users create fatture"
ON public.fatture FOR INSERT
WITH CHECK (
  company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Company users update fatture"
ON public.fatture FOR UPDATE
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Company users delete fatture"
ON public.fatture FOR DELETE
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE TRIGGER update_fatture_updated_at
BEFORE UPDATE ON public.fatture
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Note di credito
CREATE TABLE public.note_credito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  fattura_id UUID REFERENCES public.fatture(id),
  numero TEXT NOT NULL DEFAULT '',
  data_emissione DATE NOT NULL DEFAULT CURRENT_DATE,
  importo NUMERIC(10,2) NOT NULL DEFAULT 0,
  causale TEXT DEFAULT '',
  xml_url TEXT DEFAULT '',
  pdf_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.note_credito ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own company note_credito"
ON public.note_credito FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Company users create note_credito"
ON public.note_credito FOR INSERT
WITH CHECK (
  company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Company users update note_credito"
ON public.note_credito FOR UPDATE
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Company users delete note_credito"
ON public.note_credito FOR DELETE
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE TRIGGER update_note_credito_updated_at
BEFORE UPDATE ON public.note_credito
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Proforma
CREATE TABLE public.proforma (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  cliente_finale_id UUID REFERENCES public.clienti_finali(id),
  numero TEXT NOT NULL DEFAULT '',
  data_emissione DATE NOT NULL DEFAULT CURRENT_DATE,
  importo NUMERIC(10,2) NOT NULL DEFAULT 0,
  scadenza DATE,
  pdf_url TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proforma ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own company proforma"
ON public.proforma FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Company users create proforma"
ON public.proforma FOR INSERT
WITH CHECK (
  company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Company users update proforma"
ON public.proforma FOR UPDATE
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Company users delete proforma"
ON public.proforma FOR DELETE
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE TRIGGER update_proforma_updated_at
BEFORE UPDATE ON public.proforma
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- FASE 9: Checklist items
-- =============================================
CREATE TABLE public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pratica_id UUID NOT NULL REFERENCES public.pratiche(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  titolo TEXT NOT NULL,
  completato BOOLEAN NOT NULL DEFAULT false,
  completato_da UUID,
  completato_at TIMESTAMPTZ,
  assegnatario_id UUID,
  ordine INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own company checklist"
ON public.checklist_items FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Company users create checklist"
ON public.checklist_items FOR INSERT
WITH CHECK (
  company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Authorized users update checklist"
ON public.checklist_items FOR UPDATE
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR is_internal(auth.uid())
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);

CREATE POLICY "Authorized users delete checklist"
ON public.checklist_items FOR DELETE
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR is_internal(auth.uid())
);

-- Enable realtime for checklist_items
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_items;
