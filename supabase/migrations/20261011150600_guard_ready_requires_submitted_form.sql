-- Una pratica di servizio completo non puo' entrare in Pronte da fare
-- attraverso uno spostamento CRM se il cliente non ha inviato il form.
-- La RPC submit_form_by_token aggiorna form_compilato_at e stage nella stessa
-- istruzione: il suo percorso legittimo resta consentito.
CREATE OR REPLACE FUNCTION public.guard_ready_requires_submitted_form()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.tipo_servizio = 'servizio_completo'
     AND NEW.form_compilato_at IS NULL
     AND EXISTS (
       SELECT 1
       FROM public.pipeline_stages AS stage
       WHERE stage.id = NEW.current_stage_id
         AND stage.stage_type = 'pronte_da_fare'
     )
  THEN
    RAISE EXCEPTION 'Il form cliente deve essere inviato prima di spostare la pratica in Pronte da fare'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_ready_requires_submitted_form ON public.enea_practices;
CREATE TRIGGER guard_ready_requires_submitted_form
BEFORE INSERT OR UPDATE OF current_stage_id, form_compilato_at, tipo_servizio
ON public.enea_practices
FOR EACH ROW
EXECUTE FUNCTION public.guard_ready_requires_submitted_form();
