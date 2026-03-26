-- =============================================
-- PRATICA RAPIDA v2.0 — Migration 003
-- ENEA/Conto Termico Practices
-- =============================================

CREATE TYPE public.practice_brand AS ENUM('enea', 'conto_termico');

CREATE TABLE public.enea_practices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.companies(id),
  current_stage_id UUID REFERENCES public.pipeline_stages(id),
  brand practice_brand NOT NULL DEFAULT 'enea',

  -- Dati cliente
  cliente_nome TEXT NOT NULL,
  cliente_cognome TEXT NOT NULL,
  cliente_email TEXT,
  cliente_telefono TEXT,
  cliente_indirizzo TEXT,
  cliente_cf TEXT,

  -- Dati pratica
  prodotto_installato TEXT,
  fornitore TEXT,
  note TEXT,
  note_interne TEXT,

  -- File (Supabase Storage URLs)
  fatture_urls TEXT[] DEFAULT '{}',
  documenti_enea_urls TEXT[] DEFAULT '{}',
  documenti_aggiuntivi_urls TEXT[] DEFAULT '{}',

  -- Documenti mancanti
  documenti_mancanti TEXT[] DEFAULT '{}',
  note_documenti_mancanti TEXT,

  -- Gestionale (sostituisce Excel)
  guadagno_lordo NUMERIC(10,2),
  guadagno_netto NUMERIC(10,2),
  data_invio_pratica DATE,
  note_gestionale TEXT,

  -- Assegnazione operatore
  operatore_id UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,

  -- Tracking solleciti
  ultimo_sollecito_privato TIMESTAMPTZ,
  conteggio_solleciti INTEGER DEFAULT 0,
  ultimo_sollecito_fornitore TIMESTAMPTZ,

  -- Form pubblico (privato compila dati)
  form_compilato_at TIMESTAMPTZ,
  form_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,

  -- Recensione
  recensione_richiesta_at TIMESTAMPTZ,
  recensione_ricevuta_at TIMESTAMPTZ,
  recensione_testo TEXT,
  recensione_stelle INTEGER CHECK (recensione_stelle BETWEEN 1 AND 5),

  -- Archivio
  archived_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.enea_practices ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at
CREATE TRIGGER update_enea_practices_updated_at
  BEFORE UPDATE ON public.enea_practices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
CREATE POLICY "Internal users full access on enea_practices"
  ON public.enea_practices FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()));

CREATE POLICY "Resellers see own practices"
  ON public.enea_practices FOR SELECT
  TO authenticated
  USING (reseller_id = public.get_reseller_company_id(auth.uid()));

CREATE POLICY "Resellers insert own practices"
  ON public.enea_practices FOR INSERT
  TO authenticated
  WITH CHECK (reseller_id = public.get_reseller_company_id(auth.uid()));

CREATE POLICY "Resellers update own practices"
  ON public.enea_practices FOR UPDATE
  TO authenticated
  USING (reseller_id = public.get_reseller_company_id(auth.uid()));

-- Performance indexes
CREATE INDEX idx_enea_practices_reseller ON public.enea_practices(reseller_id);
CREATE INDEX idx_enea_practices_stage ON public.enea_practices(current_stage_id);
CREATE INDEX idx_enea_practices_brand ON public.enea_practices(brand);
CREATE INDEX idx_enea_practices_form_token ON public.enea_practices(form_token);
CREATE INDEX idx_enea_practices_archived ON public.enea_practices(archived_at) WHERE archived_at IS NULL;

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.enea_practices;
