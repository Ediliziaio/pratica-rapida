-- Aggiunge la colonna data_fine_lavori alla tabella enea_practices.
-- Il rivenditore la inserisce dal form (sezione "Dati cliente finale");
-- lo staff la vede nella card dettaglio pratica in KanbanBoard.
ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS data_fine_lavori date;

COMMENT ON COLUMN public.enea_practices.data_fine_lavori IS
  'Data di fine lavori indicata dal rivenditore, necessaria per la pratica ENEA.';
