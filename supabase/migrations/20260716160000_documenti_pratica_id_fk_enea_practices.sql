-- documenti.pratica_id: la foreign key puntava ancora a `pratiche` (legacy).
--
-- `pratiche` è deprecata dal 2026-04-24 (dati migrati in enea_practices con gli
-- stessi UUID) e non riceve più righe nuove: ha 12 righe contro le 236 di
-- enea_practices. Il vincolo rendeva quindi IMPOSSIBILE allegare un documento a
-- una pratica creata dopo la migrazione — cioè a 226 pratiche su 236: l'insert
-- veniva rifiutato per violazione della FK.
--
-- Effetto pratico: la "Dichiarazione Requisiti Tecnici" non è mai stata
-- salvabile, né a mano dal dialog del super_admin né dalla generazione
-- automatica allo stage "recensione" — infatti in tabella non ne esiste
-- nessuna. Il dialog mostrava solo "Salvataggio metadata fallito".
--
-- Ripuntiamo la FK su enea_practices, che è la tabella viva. Verificato prima
-- di applicare: nessuna delle righe esistenti in `documenti` diventa orfana
-- (le 3 con pratica_id valorizzato esistono tutte in enea_practices), quindi
-- il vincolo si crea senza scarti.
ALTER TABLE public.documenti
  DROP CONSTRAINT IF EXISTS documenti_pratica_id_fkey;

ALTER TABLE public.documenti
  ADD CONSTRAINT documenti_pratica_id_fkey
  FOREIGN KEY (pratica_id) REFERENCES public.enea_practices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.documenti.pratica_id IS
  'Pratica a cui il documento è allegato. Punta a enea_practices (non alla legacy `pratiche`).';
