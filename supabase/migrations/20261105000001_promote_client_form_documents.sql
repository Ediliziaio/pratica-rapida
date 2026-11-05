-- A form upload is a practice attachment regardless of the form field that
-- collected it. Only paths belonging to this practice and present in Storage
-- are promoted; dati_form remains a copy of the customer's answers.
CREATE OR REPLACE FUNCTION public.form_uploaded_documents(
  p_practice_id uuid,
  p_form jsonb
)
RETURNS TABLE(path text, is_invoice boolean)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  WITH RECURSIVE nodes(keys, value) AS (
    SELECT ARRAY[]::text[], COALESCE(p_form, '{}'::jsonb)
    UNION ALL
    SELECT nodes.keys || child.key, child.value
    FROM nodes
    CROSS JOIN LATERAL (
      SELECT obj.key, obj.value
      FROM jsonb_each(CASE WHEN jsonb_typeof(nodes.value) = 'object'
        THEN nodes.value ELSE '{}'::jsonb END) AS obj
      UNION ALL
      SELECT ''::text, item.value
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(nodes.value) = 'array'
        THEN nodes.value ELSE '[]'::jsonb END) AS item
    ) AS child
  )
  SELECT stored.name,
    bool_or(array_to_string(nodes.keys, '.') ~* '(fattur|invoice)'
      OR stored.name ~* '/(fattur|invoice)[^/]*/')
  FROM nodes
  JOIN storage.objects AS stored
    ON stored.bucket_id = 'enea-documents'
   AND stored.name = nodes.value #>> '{}'
   AND stored.name LIKE p_practice_id::text || '/%'
  WHERE jsonb_typeof(nodes.value) = 'string'
  GROUP BY stored.name;
$$;

REVOKE ALL ON FUNCTION public.form_uploaded_documents(uuid, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.promote_client_form_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_invoices text[];
  v_additional text[];
BEGIN
  SELECT COALESCE(array_agg(path ORDER BY path), ARRAY[]::text[])
    INTO v_invoices
  FROM public.form_uploaded_documents(NEW.id, NEW.dati_form)
  WHERE is_invoice
    AND NOT path = ANY(COALESCE(NEW.fatture_urls, ARRAY[]::text[]));

  NEW.fatture_urls := COALESCE(NEW.fatture_urls, ARRAY[]::text[]) || v_invoices;

  SELECT COALESCE(array_agg(path ORDER BY path), ARRAY[]::text[])
    INTO v_additional
  FROM public.form_uploaded_documents(NEW.id, NEW.dati_form)
  WHERE NOT is_invoice
    AND NOT path = ANY(COALESCE(NEW.documenti_aggiuntivi_urls, ARRAY[]::text[]))
    AND NOT path = ANY(NEW.fatture_urls);

  NEW.documenti_aggiuntivi_urls :=
    COALESCE(NEW.documenti_aggiuntivi_urls, ARRAY[]::text[]) || v_additional;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promote_client_form_documents ON public.enea_practices;
CREATE TRIGGER promote_client_form_documents
BEFORE INSERT OR UPDATE OF dati_form ON public.enea_practices
FOR EACH ROW
EXECUTE FUNCTION public.promote_client_form_documents();

-- Recover existing uploads without re-uploading or replacing reseller files.
-- Updating attachment columns alone does not change a stage or re-submit a form.
WITH recovered AS (
  SELECT practice.id,
    COALESCE(array_agg(doc.path ORDER BY doc.path)
      FILTER (WHERE doc.is_invoice
        AND NOT doc.path = ANY(COALESCE(practice.fatture_urls, ARRAY[]::text[]))),
      ARRAY[]::text[]) AS invoices,
    COALESCE(array_agg(doc.path ORDER BY doc.path)
      FILTER (WHERE NOT doc.is_invoice
        AND NOT doc.path = ANY(COALESCE(practice.documenti_aggiuntivi_urls, ARRAY[]::text[]))
        AND NOT doc.path = ANY(COALESCE(practice.fatture_urls, ARRAY[]::text[]))),
      ARRAY[]::text[]) AS additional
  FROM public.enea_practices AS practice
  CROSS JOIN LATERAL public.form_uploaded_documents(practice.id, practice.dati_form) AS doc
  WHERE practice.dati_form IS NOT NULL
  GROUP BY practice.id, practice.fatture_urls, practice.documenti_aggiuntivi_urls
)
UPDATE public.enea_practices AS practice
SET fatture_urls = COALESCE(practice.fatture_urls, ARRAY[]::text[]) || recovered.invoices,
    documenti_aggiuntivi_urls =
      COALESCE(practice.documenti_aggiuntivi_urls, ARRAY[]::text[]) || recovered.additional
FROM recovered
WHERE practice.id = recovered.id
  AND (cardinality(recovered.invoices) > 0 OR cardinality(recovered.additional) > 0);
