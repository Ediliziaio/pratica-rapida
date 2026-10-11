-- Da quale porta e' entrata la pratica.
--
-- Serve a riconoscere le pratiche del secondo marchio senza duplicare niente:
-- la macchina resta una sola, cambia solo chi ha bussato.
--
-- **La colonna nasce vuota, di proposito.** Dentro Pratica Rapida non ci sono
-- solo rivenditori: ci sono anche clienti finali che pagano online, con
-- prezzi diversi. Mettere 'rivenditore' come valore predefinito avrebbe
-- scritto una falsita' su centinaia di righe. Vuoto vuol dire «non
-- classificata», che e' la verita': l'informazione su quelle pratiche si
-- ricava gia' da tipo_fatturazione e dal contenitore del rivenditore.
--
-- Il vincolo lascia aperti i valori che servirebbero a una classificazione
-- futura, cosi' quel giorno non si rifa' la colonna — ma classificare le
-- pratiche esistenti e' una decisione del Titolare, non di questa migrazione.
--
-- Nota: `brand` esiste gia' ma dice un'altra cosa — la linea di servizio
-- (enea / conto_termico), non la porta d'ingresso. Una pratica di EneaSubito
-- resta brand = 'enea'.

ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS canale text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enea_practices_canale_check'
  ) THEN
    ALTER TABLE public.enea_practices
      ADD CONSTRAINT enea_practices_canale_check
      CHECK (canale IS NULL OR canale IN ('rivenditore', 'privato_sito', 'eneasubito'));
  END IF;
END $$;

COMMENT ON COLUMN public.enea_practices.canale IS
  'Porta d''ingresso della pratica. Vuoto = non classificata (tutte quelle precedenti al secondo marchio). eneasubito = cliente privato dal sito del secondo marchio. Non confondere con brand, che e'' la linea di servizio.';

CREATE INDEX IF NOT EXISTS idx_enea_practices_canale_eneasubito
  ON public.enea_practices (created_at DESC)
  WHERE canale = 'eneasubito';
