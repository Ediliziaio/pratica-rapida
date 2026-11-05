-- Integration test for an isolated Supabase database AFTER the promotion
-- migration. Do not run on production: it creates temporary practices/files.
BEGIN;

DO $$
DECLARE
  v_company uuid;
  v_form_id uuid := gen_random_uuid();
  v_dealer_id uuid := gen_random_uuid();
  v_form_token text := gen_random_uuid()::text;
  v_invoice text := v_form_id::text || '/dynamic/invoice.pdf';
  v_technical text := v_form_id::text || '/dynamic/technical.pdf';
  v_dealer_invoice text := v_dealer_id::text || '/fattura/invoice.pdf';
  v_dealer_technical text := v_dealer_id::text || '/doc_extra/technical.pdf';
  v_missing text := v_form_id::text || '/dynamic/not-saved.pdf';
  v_form_invoices text[];
  v_form_additional text[];
  v_dealer_invoices text[];
  v_dealer_additional text[];
BEGIN
  SELECT id INTO v_company FROM public.companies LIMIT 1;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Fixture requires one company';
  END IF;

  INSERT INTO storage.objects(bucket_id, name)
  VALUES ('enea-documents', v_invoice), ('enea-documents', v_technical),
         ('enea-documents', v_dealer_invoice), ('enea-documents', v_dealer_technical);

  INSERT INTO public.enea_practices
    (id, reseller_id, cliente_nome, cliente_cognome, form_token)
  VALUES (v_form_id, v_company, 'Test', 'Modulo', v_form_token);

  -- The public form autosave is the real write/decision point. The invoice
  -- key is nested in an array; the technical file uses another field.
  PERFORM public.save_form_draft_by_token(v_form_token, jsonb_build_object(
    'sezione', jsonb_build_object('righe', jsonb_build_array(
      jsonb_build_object('fattura', v_invoice, 'certificato', v_technical,
        'allegato_non_salvato', v_missing,
        'file_di_altra_pratica', v_dealer_technical)
    ))
  ));

  SELECT fatture_urls, documenti_aggiuntivi_urls
    INTO v_form_invoices, v_form_additional
  FROM public.enea_practices WHERE id = v_form_id;

  IF v_form_invoices IS DISTINCT FROM ARRAY[v_invoice]
     OR v_form_additional IS DISTINCT FROM ARRAY[v_technical] THEN
    RAISE EXCEPTION 'Form upload not promoted to practice columns';
  END IF;

  -- Repeat autosave: no duplicate links.
  PERFORM public.save_form_draft_by_token(v_form_token, jsonb_build_object(
    'sezione', jsonb_build_object('righe', jsonb_build_array(
      jsonb_build_object('fattura', v_invoice, 'certificato', v_technical)
    ))
  ));
  IF (SELECT cardinality(fatture_urls) + cardinality(documenti_aggiuntivi_urls)
      FROM public.enea_practices WHERE id = v_form_id) <> 2 THEN
    RAISE EXCEPTION 'Repeated form save duplicated attachments';
  END IF;

  -- Dealer-panel path: the same two types must occupy the same columns.
  INSERT INTO public.enea_practices
    (id, reseller_id, cliente_nome, cliente_cognome,
     fatture_urls, documenti_aggiuntivi_urls)
  VALUES (v_dealer_id, v_company, 'Test', 'Rivenditore',
          ARRAY[v_dealer_invoice], ARRAY[v_dealer_technical]);

  SELECT fatture_urls, documenti_aggiuntivi_urls
    INTO v_dealer_invoices, v_dealer_additional
  FROM public.enea_practices WHERE id = v_dealer_id;

  IF cardinality(v_form_invoices) <> cardinality(v_dealer_invoices)
     OR cardinality(v_form_additional) <> cardinality(v_dealer_additional)
     OR NOT EXISTS (
       SELECT 1 FROM public.form_uploaded_documents(v_form_id,
         (SELECT dati_form FROM public.enea_practices WHERE id = v_form_id))
       WHERE is_invoice
     ) THEN
    RAISE EXCEPTION 'Form/dealer attachment decision diverges';
  END IF;
END;
$$;

ROLLBACK;
