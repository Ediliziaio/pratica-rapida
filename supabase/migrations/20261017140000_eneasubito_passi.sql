-- Dove si ferma chi apre il modulo di EneaSubito.
--
-- Il 17/10/2026: sedici persone atterrate sul modulo dall'annuncio, zero che
-- hanno lasciato il nome. Senza sapere DOVE si fermano, ogni modifica alla
-- pagina e' un tiro al buio.
--
-- Si misura un imbuto, non si segue una persona: c'e' il numero a caso della
-- visita (dura quanto la scheda del browser), il nome del passo e l'ora.
-- Nessun nome, nessun indirizzo, niente che permetta di risalire a qualcuno.

CREATE TABLE IF NOT EXISTS public.eneasubito_passi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita text NOT NULL,
  passo text NOT NULL CHECK (
    passo IN ('aperto','lavoro','nome','email','continua','passo2','fattura','pagamento')
  ),
  quando timestamptz NOT NULL DEFAULT now(),
  -- Lo stesso passo nella stessa visita si conta una volta: chi torna indietro
  -- e riprova non deve sembrare due persone.
  UNIQUE (visita, passo)
);

CREATE INDEX IF NOT EXISTS idx_eneasubito_passi_quando
  ON public.eneasubito_passi (quando DESC);

ALTER TABLE public.eneasubito_passi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff legge i passi" ON public.eneasubito_passi;
CREATE POLICY "staff legge i passi"
  ON public.eneasubito_passi FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

COMMENT ON TABLE public.eneasubito_passi IS
  'Imbuto del modulo EneaSubito: quale passo ha raggiunto ogni visita anonima.';
