-- The public form must read practice attachments from the same canonical
-- columns used by the CRM and APR, not from the dati_form answer snapshot.
-- A form token exposes only the two attachment lists of its own practice.
CREATE OR REPLACE FUNCTION public.get_form_attachments_by_token(p_token text)
RETURNS TABLE (
  fatture_urls text[],
  documenti_aggiuntivi_urls text[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(ep.fatture_urls, ARRAY[]::text[]),
         COALESCE(ep.documenti_aggiuntivi_urls, ARRAY[]::text[])
  FROM public.enea_practices AS ep
  WHERE ep.form_token = p_token
    AND ep.archived_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_form_attachments_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_form_attachments_by_token(text) TO anon, authenticated;
