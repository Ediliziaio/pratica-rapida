-- Una bozza tecnica deve restare nascosta al CRM interno soltanto finche'
-- il modulo non e' stato inviato. Il marker workflow.reseller_form_draft
-- viene preservato dall'autosalvataggio e puo' restare nel payload finale:
-- form_compilato_at e' quindi la fonte autorevole per distinguere la bozza
-- dalla pratica realmente ricevuta.

DROP POLICY IF EXISTS "Internal CRM hides incomplete reseller online drafts"
  ON public.enea_practices;

CREATE POLICY "Internal CRM hides incomplete reseller online drafts"
  ON public.enea_practices
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public.is_internal(auth.uid())
    OR form_compilato_at IS NOT NULL
    OR COALESCE(dati_form #>> '{workflow,reseller_form_draft}', 'false') <> 'true'
    OR COALESCE(dati_form #>> '{workflow,owner_review_required}', 'false') = 'true'
  );

COMMENT ON POLICY "Internal CRM hides incomplete reseller online drafts"
  ON public.enea_practices IS
  'Nasconde al CRM interno soltanto le bozze online non ancora inviate; le pratiche con form_compilato_at valorizzato sono sempre visibili.';
