-- ============================================================
-- Fix — Allinea pipeline_stages.name allo spec §3.1
--
-- Spec dice:
--   stage_type              name (lato superadmin)
--   inviata            →    "Inviato da chiamare"
--   attesa_compilazione →   "Chiamati in attesa"
--   pronte_da_fare     →    "Pronte da fare"
--   documenti_mancanti →    "Documenti mancanti"
--   da_inviare         →    "Invio pratica chiusa"
--   gestionale         →    "Da inserire su Excel"
--   recensione         →    "Recensione"
--   archiviate         →    "Archiviate"
-- ============================================================

UPDATE public.pipeline_stages SET name = 'Inviato da chiamare'
  WHERE stage_type = 'inviata' AND reseller_id IS NULL;

UPDATE public.pipeline_stages SET name = 'Chiamati in attesa'
  WHERE stage_type = 'attesa_compilazione' AND reseller_id IS NULL;

UPDATE public.pipeline_stages SET name = 'Invio pratica chiusa'
  WHERE stage_type = 'da_inviare' AND reseller_id IS NULL;

UPDATE public.pipeline_stages SET name = 'Da inserire su Excel'
  WHERE stage_type = 'gestionale' AND reseller_id IS NULL;
