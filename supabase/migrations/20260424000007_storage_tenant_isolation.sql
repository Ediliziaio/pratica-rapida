-- ============================================================
-- Fix B — Storage tenant isolation + crea bucket enea-documents
--
-- Problema 1: bucket `enea-documents` non esiste ma è usato dal
--             codice ENEA → tutti gli upload falliscono.
-- Problema 2: bucket `documenti` ha policy RLS aperte a TUTTI gli
--             utenti authenticated → qualsiasi reseller può leggere
--             e cancellare file di qualsiasi tenant.
--
-- Convenzioni path:
--   documenti (legacy)    → {company_id}/{pratica_id}/{filename}
--   enea-documents (new)  → {practice_id}/{tipo}/{filename}
--                        → fatture-insolute/{reseller_id}/{filename}
-- ============================================================

-- 1. Crea bucket enea-documents (privato)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'enea-documents',
  'enea-documents',
  false,
  52428800, -- 50 MB
  ARRAY['application/pdf','image/png','image/jpeg','image/jpg','application/zip',
        'application/x-pkcs7-mime','application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Helper function per bucket documenti (legacy)
CREATE OR REPLACE FUNCTION public.can_access_legacy_file(file_name text, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  user_company uuid;
  first_segment text;
BEGIN
  IF public.is_internal(user_uuid) THEN
    RETURN true;
  END IF;

  user_company := public.get_reseller_company_id(user_uuid);
  IF user_company IS NULL THEN
    RETURN false;
  END IF;

  first_segment := split_part(file_name, '/', 1);

  BEGIN
    RETURN first_segment = user_company::text;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
END;
$$;

-- 3. Helper function per bucket enea-documents (new)
CREATE OR REPLACE FUNCTION public.can_access_enea_file(file_name text, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  user_company uuid;
  first_segment text;
  second_segment text;
BEGIN
  IF public.is_internal(user_uuid) THEN
    RETURN true;
  END IF;

  user_company := public.get_reseller_company_id(user_uuid);
  IF user_company IS NULL THEN
    RETURN false;
  END IF;

  first_segment := split_part(file_name, '/', 1);
  second_segment := split_part(file_name, '/', 2);

  -- Pattern: fatture-insolute/{reseller_id}/...
  IF first_segment = 'fatture-insolute' THEN
    RETURN second_segment = user_company::text;
  END IF;

  -- Pattern: archivio/{year}/{month}/{client}_{practice_id}/...
  -- Per sicurezza nego — questi file contengono il practice_id alla fine,
  -- accessibili via enea-documents con la pattern principale
  IF first_segment = 'archivio' THEN
    RETURN false;
  END IF;

  -- Pattern: {practice_id}/{tipo}/...
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM public.enea_practices ep
      WHERE ep.id::text = first_segment
        AND ep.reseller_id = user_company
    );
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
END;
$$;

-- 4. Drop vecchie policy permissive
DROP POLICY IF EXISTS "Company users read files" ON storage.objects;
DROP POLICY IF EXISTS "Company users upload files" ON storage.objects;
DROP POLICY IF EXISTS "Company users delete own files" ON storage.objects;

-- 5. Nuove policy per bucket `documenti` (legacy)
CREATE POLICY "documenti tenant read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documenti'
    AND public.can_access_legacy_file(name, auth.uid())
  );

CREATE POLICY "documenti tenant upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documenti'
    AND public.can_access_legacy_file(name, auth.uid())
  );

CREATE POLICY "documenti internal only delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documenti'
    AND public.is_internal(auth.uid())
  );

CREATE POLICY "documenti internal update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documenti'
    AND public.is_internal(auth.uid())
  );

-- 6. Policy per bucket `enea-documents` (new)
CREATE POLICY "enea tenant read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'enea-documents'
    AND public.can_access_enea_file(name, auth.uid())
  );

CREATE POLICY "enea tenant upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'enea-documents'
    AND public.can_access_enea_file(name, auth.uid())
  );

CREATE POLICY "enea internal only delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'enea-documents'
    AND public.is_internal(auth.uid())
  );

CREATE POLICY "enea internal update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'enea-documents'
    AND public.is_internal(auth.uid())
  );
