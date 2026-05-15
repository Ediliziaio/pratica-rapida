-- ============================================================
-- Bug fix: pratiche scomparivano dal kanban del rivenditore quando
-- spostate negli stage finali "Da inserire su Excel" (gestionale)
-- o "Recensione".
--
-- Causa: i due stage avevano is_visible_reseller=false con name_reseller=null.
-- Il `stageToColumn` di KanbanBoard.tsx (linea 2169) saltava gli stage
-- con is_visible_reseller=false → le pratiche residenti in quegli stage
-- non venivano mappate a nessuna colonna virtuale del kanban del rivenditore
-- → letteralmente sparivano dalla sua vista.
--
-- Fix: rendiamo is_visible_reseller=true e diamo name_reseller='Pratica inviata'.
-- Il `stageToColumn` raggruppa per `name_reseller`, quindi tutti e tre gli
-- stage finali (`da_inviare`, `gestionale`, `recensione`) ricadono nella
-- stessa colonna virtuale "Pratica inviata" lato rivenditore — coerente
-- con il pattern esistente. Lato staff (`isInternal=true`) le 3 colonne
-- restano separate, perché il mapping internal è 1:1 (linea 2163-2165).
--
-- Vantaggio: nessun cambio nella logica frontend, solo dati allineati.
-- ============================================================

UPDATE public.pipeline_stages
SET
  is_visible_reseller = true,
  name_reseller = 'Pratica inviata',
  tooltip_text = COALESCE(
    tooltip_text,
    'Pratica completata e inviata al cliente finale.'
  )
WHERE stage_type IN ('gestionale', 'recensione')
  AND reseller_id IS NULL;
