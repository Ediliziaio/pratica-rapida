-- Flusso fotovoltaico isolato.
-- Non modifica enea_practices, pipeline_stages o le automazioni esistenti.

CREATE TABLE IF NOT EXISTS public.fotovoltaico_practices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'bozza'
    CHECK (status IN (
      'bozza',
      'ricevuta_da_controllare',
      'da_contattare_proprietario',
      'attesa_proprietario',
      'attesa_rivenditore',
      'pronta_presentazione',
      'presso_distributore',
      'attivazione_gse',
      'conclusa'
    )),
  riferimento_interno TEXT,
  proprietario_nome TEXT,
  proprietario_telefono TEXT,
  proprietario_email TEXT,
  indirizzo_impianto TEXT,
  stato_impianto TEXT
    CHECK (stato_impianto IS NULL OR stato_impianto IN (
      'lavori_non_iniziati',
      'lavori_in_corso',
      'installato_non_connesso',
      'gia_connesso'
    )),
  pod TEXT,
  distributore TEXT,
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fotovoltaico_practices_reseller
  ON public.fotovoltaico_practices(reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fotovoltaico_practices_status
  ON public.fotovoltaico_practices(status, created_at DESC)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS update_fotovoltaico_practices_updated_at
  ON public.fotovoltaico_practices;
CREATE TRIGGER update_fotovoltaico_practices_updated_at
  BEFORE UPDATE ON public.fotovoltaico_practices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fotovoltaico_practices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage photovoltaic practices"
  ON public.fotovoltaico_practices FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()))
  WITH CHECK (public.is_internal(auth.uid()));

CREATE POLICY "Companies read own photovoltaic practices"
  ON public.fotovoltaico_practices FOR SELECT
  TO authenticated
  USING (reseller_id IN (SELECT public.get_user_company_ids(auth.uid())));

CREATE POLICY "Companies create own photovoltaic practices"
  ON public.fotovoltaico_practices FOR INSERT
  TO authenticated
  WITH CHECK (
    reseller_id IN (SELECT public.get_user_company_ids(auth.uid()))
    AND created_by = auth.uid()
  );

CREATE POLICY "Companies update own photovoltaic drafts"
  ON public.fotovoltaico_practices FOR UPDATE
  TO authenticated
  USING (
    reseller_id IN (SELECT public.get_user_company_ids(auth.uid()))
    AND status = 'bozza'
  )
  WITH CHECK (
    reseller_id IN (SELECT public.get_user_company_ids(auth.uid()))
    AND status IN ('bozza', 'ricevuta_da_controllare')
  );

CREATE TABLE IF NOT EXISTS public.fotovoltaico_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES public.fotovoltaico_practices(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  uploaded_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fotovoltaico_attachments_practice
  ON public.fotovoltaico_attachments(practice_id, created_at);

ALTER TABLE public.fotovoltaico_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage photovoltaic attachments"
  ON public.fotovoltaico_attachments FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()))
  WITH CHECK (public.is_internal(auth.uid()));

CREATE POLICY "Companies read own photovoltaic attachments"
  ON public.fotovoltaico_attachments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.fotovoltaico_practices fp
    WHERE fp.id = practice_id
      AND fp.reseller_id IN (SELECT public.get_user_company_ids(auth.uid()))
  ));

CREATE POLICY "Companies add attachments to own drafts"
  ON public.fotovoltaico_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.fotovoltaico_practices fp
      WHERE fp.id = practice_id
        AND fp.status = 'bozza'
        AND fp.reseller_id IN (SELECT public.get_user_company_ids(auth.uid()))
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fotovoltaico-documents',
  'fotovoltaico-documents',
  false,
  15728640,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff manage photovoltaic storage"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'fotovoltaico-documents'
    AND public.is_internal(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'fotovoltaico-documents'
    AND public.is_internal(auth.uid())
  );

CREATE POLICY "Companies read own photovoltaic storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fotovoltaico-documents'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT public.get_user_company_ids(auth.uid())
    )
  );

CREATE POLICY "Companies upload own photovoltaic storage"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fotovoltaico-documents'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT public.get_user_company_ids(auth.uid())
    )
  );

COMMENT ON TABLE public.fotovoltaico_practices IS
  'Pratiche di connessione fotovoltaico: flusso separato da ENEA e dalle sue automazioni.';
