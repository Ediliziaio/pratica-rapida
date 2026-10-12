-- Il Servizio Completo CF raccoglie fattura e fine lavori dal form cliente.
-- Guard server-side: un invio incompleto non può diventare lavorabile.
CREATE OR REPLACE FUNCTION public.apply_cf_customer_completion_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_date_text text;
  v_invoice_path text;
BEGIN
  IF OLD.form_compilato_at IS NOT NULL OR NEW.form_compilato_at IS NULL
     OR NEW.tipo_fatturazione IS DISTINCT FROM 'cliente_finale'
     OR NEW.tipo_servizio IS DISTINCT FROM 'servizio_completo'
  THEN
    RETURN NEW;
  END IF;

  v_date_text := nullif(trim(NEW.dati_form->'documenti'->>'data_fine_lavori'), '');
  IF v_date_text IS NOT NULL THEN
    IF v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Data di fine lavori non valida: usa giorno, mese e anno'
        USING ERRCODE = 'P0001';
    END IF;
    NEW.data_fine_lavori := v_date_text::date;
  ELSIF NEW.data_fine_lavori IS NULL THEN
    RAISE EXCEPTION 'Data di fine lavori obbligatoria nel modulo cliente'
      USING ERRCODE = 'P0001';
  END IF;

  v_invoice_path := nullif(trim(NEW.dati_form->'documenti'->>'fattura_url'), '');
  IF v_invoice_path IS NOT NULL THEN
    -- Il renderer precedente usava /dynamic/, il nuovo usa /fattura/.
    IF v_invoice_path NOT LIKE NEW.id::text || '/fattura/%'
       AND v_invoice_path NOT LIKE NEW.id::text || '/dynamic/%' THEN
      RAISE EXCEPTION 'La fattura caricata non appartiene a questa pratica'
        USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'enea-documents' AND name = v_invoice_path
    ) THEN
      RAISE EXCEPTION 'Fattura non trovata tra i file caricati: caricala di nuovo'
        USING ERRCODE = 'P0001';
    END IF;
    IF NOT v_invoice_path = ANY(COALESCE(NEW.fatture_urls, ARRAY[]::text[])) THEN
      NEW.fatture_urls := array_append(COALESCE(NEW.fatture_urls, ARRAY[]::text[]), v_invoice_path);
    END IF;
  ELSIF COALESCE(array_length(NEW.fatture_urls, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Fattura obbligatoria nel modulo cliente'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cf_customer_completion_evidence ON public.enea_practices;
CREATE TRIGGER cf_customer_completion_evidence
  BEFORE UPDATE ON public.enea_practices
  FOR EACH ROW
  WHEN (OLD.form_compilato_at IS NULL AND NEW.form_compilato_at IS NOT NULL)
  EXECUTE FUNCTION public.apply_cf_customer_completion_evidence();
