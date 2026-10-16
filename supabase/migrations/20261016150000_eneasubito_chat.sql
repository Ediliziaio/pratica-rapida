-- I messaggi della chat di EneaSubito.
--
-- Ci finisce solo quello che la chat non sa rispondere da sola: le
-- venticinque domande previste hanno la risposta scritta e non passano di
-- qui. Quindi questa tabella e' corta per costruzione, ed e' anche il suo
-- scopo — ogni riga e' una domanda che non avevamo previsto, cioe' la
-- prossima voce dell'elenco.
--
-- Nessun dato di piu' di quello che serve per rispondere: il testo,
-- l'indirizzo e la pagina da cui scriveva. Chi apre una chat per fare una
-- domanda non si aspetta di lasciare una scia.

CREATE TABLE IF NOT EXISTS public.eneasubito_chat_messaggi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  testo text NOT NULL CHECK (length(btrim(testo)) BETWEEN 5 AND 4000),
  email text NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  -- Solo il percorso, mai l'indirizzo intero: quello puo' portarsi dietro i
  -- parametri della pubblicita' e la ricerca che la persona ha digitato.
  pagina text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Quando il Titolare l'ha letto e quando ha risposto: due momenti diversi,
  -- e il secondo e' quello che conta per sapere se qualcuno e' rimasto
  -- appeso.
  letto_at timestamptz,
  risposto_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_eneasubito_chat_da_leggere
  ON public.eneasubito_chat_messaggi (created_at DESC)
  WHERE risposto_at IS NULL;

-- Li scrive solo la funzione `eneasubito-chat`, che gira con la chiave di
-- servizio; li legge solo lo staff dal CRM. Nessun accesso anonimo diretto:
-- la tabella non si tocca dal browser.
ALTER TABLE public.eneasubito_chat_messaggi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff legge i messaggi della chat" ON public.eneasubito_chat_messaggi;
CREATE POLICY "staff legge i messaggi della chat"
  ON public.eneasubito_chat_messaggi
  FOR SELECT
  TO authenticated
  USING (public.is_internal(auth.uid()));

DROP POLICY IF EXISTS "staff segna i messaggi della chat" ON public.eneasubito_chat_messaggi;
CREATE POLICY "staff segna i messaggi della chat"
  ON public.eneasubito_chat_messaggi
  FOR UPDATE
  TO authenticated
  USING (public.is_internal(auth.uid()))
  WITH CHECK (public.is_internal(auth.uid()));

COMMENT ON TABLE public.eneasubito_chat_messaggi IS
  'Domande della chat EneaSubito a cui il copione non sapeva rispondere. Ogni riga e'' una candidata a diventare una voce dell''elenco.';
