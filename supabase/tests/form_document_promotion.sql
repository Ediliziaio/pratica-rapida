-- Execute against a database with the migration installed. This test uses
-- existing Storage objects but writes ONLY a temporary table; it does not
-- create or modify a real CRM practice and rolls back at the end.
BEGIN;

CREATE TEMP TABLE form_document_fixture (
  id uuid NOT NULL,
  dati_form jsonb,
  fatture_urls text[] DEFAULT '{}',
  documenti_aggiuntivi_urls text[] DEFAULT '{}'
);
CREATE TRIGGER promote_client_form_documents
BEFORE INSERT OR UPDATE OF dati_form ON form_document_fixture
FOR EACH ROW EXECUTE FUNCTION public.promote_client_form_documents();

DO $$
DECLARE
  v_practice_id uuid;
  v_invoice text;
  v_technical text;
  v_invoices text[];
  v_additional text[];
BEGIN
  SELECT p.id,
    min(d.path) FILTER (WHERE d.is_invoice),
    min(d.path) FILTER (WHERE NOT d.is_invoice)
  INTO v_practice_id, v_invoice, v_technical
  FROM public.enea_practices AS p
  CROSS JOIN LATERAL public.form_uploaded_documents(p.id, p.dati_form) AS d
  WHERE p.dati_form IS NOT NULL
  GROUP BY p.id
  HAVING count(*) FILTER (WHERE d.is_invoice) > 0
     AND count(*) FILTER (WHERE NOT d.is_invoice) > 0
  LIMIT 1;
  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'No existing form with both document types for fixture';
  END IF;

  -- The same trigger that receives a form autosave must classify uploads by
  -- nested field/section, verify Storage, and deduplicate on repeated save.
  INSERT INTO form_document_fixture(id, dati_form)
  VALUES (v_practice_id, jsonb_build_object(
    'sezione', jsonb_build_object('righe', jsonb_build_array(
      jsonb_build_object('fattura', v_invoice,
        'certificato', v_technical,
        'file_non_salvato', v_practice_id::text || '/dynamic/missing.pdf')
    ))
  ));
  SELECT fatture_urls, documenti_aggiuntivi_urls
    INTO v_invoices, v_additional
  FROM form_document_fixture WHERE id = v_practice_id;
  IF v_invoices IS DISTINCT FROM ARRAY[v_invoice]
     OR v_additional IS DISTINCT FROM ARRAY[v_technical] THEN
    RAISE EXCEPTION 'Form save did not link files to the correct columns';
  END IF;

  UPDATE form_document_fixture SET dati_form = dati_form
  WHERE id = v_practice_id;
  IF (SELECT cardinality(fatture_urls) + cardinality(documenti_aggiuntivi_urls)
      FROM form_document_fixture WHERE id = v_practice_id) <> 2 THEN
    RAISE EXCEPTION 'Repeated form save duplicated a file';
  END IF;

  -- The reseller-panel route writes these columns directly; the resulting
  -- column cardinalities must match the form route for the same two types.
  INSERT INTO form_document_fixture(id, fatture_urls, documenti_aggiuntivi_urls)
  VALUES (gen_random_uuid(), ARRAY[v_invoice], ARRAY[v_technical]);
  IF (SELECT count(*) FROM form_document_fixture
      WHERE cardinality(fatture_urls) = 1
        AND cardinality(documenti_aggiuntivi_urls) = 1) <> 2 THEN
    RAISE EXCEPTION 'Form and reseller attachment columns differ';
  END IF;
END;
$$;

ROLLBACK;
