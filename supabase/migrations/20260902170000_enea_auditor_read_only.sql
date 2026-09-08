-- Account ENEA auditor: lettura globale delle pratiche ENEA e dei relativi
-- documenti, senza alcuna capability INSERT / UPDATE / DELETE.
--
-- L'account Auth riceve il ruolo applicativo minimo `rivenditore` soltanto per
-- attraversare il routing UI esistente, ma NON riceve user_company_assignments.
-- L'accesso ai dati deriva esclusivamente da questa allowlist separata.

CREATE TABLE IF NOT EXISTS public.enea_auditors (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(label)) BETWEEN 1 AND 120)
);

ALTER TABLE public.enea_auditors ENABLE ROW LEVEL SECURITY;

-- La tabella di membership non deve essere leggibile o modificabile da client.
-- Soltanto postgres/service_role può amministrarla fuori dalle API utente.
REVOKE ALL ON TABLE public.enea_auditors FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_enea_auditor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enea_auditors ea
    WHERE ea.user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_enea_auditor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_enea_auditor(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "ENEA auditors read all practices" ON public.enea_practices;
CREATE POLICY "ENEA auditors read all practices"
  ON public.enea_practices
  FOR SELECT
  TO authenticated
  USING (public.is_enea_auditor(auth.uid()));

DROP POLICY IF EXISTS "ENEA auditors read documents" ON storage.objects;
CREATE POLICY "ENEA auditors read documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'enea-documents'
    AND public.is_enea_auditor(auth.uid())
  );

COMMENT ON TABLE public.enea_auditors IS
  'Allowlist server-side per account ENEA di audit in sola lettura. Nessun grant client e nessuna policy mutativa.';

COMMENT ON FUNCTION public.is_enea_auditor(uuid) IS
  'TRUE soltanto per identita presenti nell allowlist ENEA auditor amministrata server-side.';

