-- Le bozze incomplete create prima della correzione non devono essere confuse
-- con nuove pratiche ricevute, ma il Titolare deve poterle vedere e recuperare.
--
-- Manteniamo quindi nascosta la normale bozza tecnica dei nuovi inserimenti e
-- rendiamo visibili soltanto le cinque righe reali gia' esistenti, senza
-- cambiare stage, form_compilato_at, token o dati del modulo.

UPDATE public.enea_practices AS practice
SET dati_form = COALESCE(practice.dati_form, '{}'::jsonb) || jsonb_build_object(
  'workflow',
  COALESCE(practice.dati_form->'workflow', '{}'::jsonb) ||
    jsonb_build_object('owner_review_required', true)
)
WHERE COALESCE(practice.dati_form #>> '{workflow,reseller_form_draft}', 'false') = 'true'
  AND practice.created_at >= timestamptz '2026-10-01 00:00:00+02';

DROP POLICY IF EXISTS "Internal CRM hides incomplete reseller online drafts"
  ON public.enea_practices;
CREATE POLICY "Internal CRM hides incomplete reseller online drafts"
  ON public.enea_practices
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public.is_internal(auth.uid())
    OR COALESCE(dati_form #>> '{workflow,reseller_form_draft}', 'false') <> 'true'
    OR COALESCE(dati_form #>> '{workflow,owner_review_required}', 'false') = 'true'
  );

COMMENT ON POLICY "Internal CRM hides incomplete reseller online drafts"
  ON public.enea_practices IS
  'Nasconde le nuove bozze tecniche incomplete; lascia visibili al CRM le bozze storiche marcate per il recupero del Titolare.';
