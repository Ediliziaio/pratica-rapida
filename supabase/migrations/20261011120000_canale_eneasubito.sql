-- Da dove arriva la pratica.
--
-- Serve a distinguere le pratiche del secondo marchio (clienti privati che
-- arrivano dal sito) da quelle dei rivenditori, senza duplicare niente: la
-- macchina resta una sola, cambia solo chi ha bussato.
--
-- Nota: la colonna `brand` esiste gia' ma dice un'altra cosa — distingue la
-- linea di servizio (enea / conto_termico), non il canale di arrivo. Una
-- pratica di EneaSubito resta brand = 'enea'.
--
-- Non rompe niente: colonna nuova con valore predefinito, le pratiche
-- esistenti diventano tutte 'rivenditore', che e' cio' che sono.

ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS canale text NOT NULL DEFAULT 'rivenditore';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enea_practices_canale_check'
  ) THEN
    ALTER TABLE public.enea_practices
      ADD CONSTRAINT enea_practices_canale_check
      CHECK (canale IN ('rivenditore', 'eneasubito'));
  END IF;
END $$;

COMMENT ON COLUMN public.enea_practices.canale IS
  'Da dove arriva la pratica: rivenditore (Pratica Rapida) oppure eneasubito (cliente privato dal sito del secondo marchio). Non confondere con brand, che e'' la linea di servizio.';

-- Le pratiche di EneaSubito si filtrano spesso da sole in coda: l'indice
-- parziale costa niente e serve solo a loro.
CREATE INDEX IF NOT EXISTS idx_enea_practices_canale_eneasubito
  ON public.enea_practices (created_at DESC)
  WHERE canale = 'eneasubito';
