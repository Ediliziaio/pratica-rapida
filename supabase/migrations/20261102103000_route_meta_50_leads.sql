-- Regola autorizzata dal Titolare il 2 novembre 2026:
-- i lead del modulo Meta dell'offerta €50 arrivati dal 31 ottobre in poi
-- appartengono alla colonna commerciale "Clienti €50".
-- Non vengono toccati altri moduli né i lead precedenti alla data stabilita.

UPDATE public.leads
SET stage_id = 'clienti_50'
WHERE meta_form_id = '2546968312490707'
  AND COALESCE(meta_created_at, created_at) >= timestamptz '2026-10-31 00:00:00+01'
  AND stage_id = 'lead';
