-- Dove si ferma il cliente privato che arriva dall'annuncio di Pratica Rapida.
--
-- Dal 19/10/2026 un annuncio Google porta il privato sulla pagina della
-- richiesta ENEA. Il percorso d'acquisto funziona e non si tocca: qui si
-- contano soltanto i passaggi, per sapere dove si perde la gente.
--
-- Si misura un imbuto, non si segue una persona: il numero a caso della
-- visita (dura quanto la scheda del browser), il nome del passo e l'ora.
-- Nessun nome, nessun indirizzo, niente che permetta di risalire a qualcuno.

CREATE TABLE IF NOT EXISTS public.praticarapida_passi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita text NOT NULL,
  passo text NOT NULL CHECK (
    passo IN (
      'aperto','privato','prodotto','nome','telefono','email','invia','registrata',
      'modulo','compila','ultima','invio','pagamento','pagato'
    )
  ),
  quando timestamptz NOT NULL DEFAULT now(),
  -- Lo stesso passo nella stessa visita si conta una volta.
  UNIQUE (visita, passo)
);

CREATE INDEX IF NOT EXISTS idx_praticarapida_passi_quando
  ON public.praticarapida_passi (quando DESC);

ALTER TABLE public.praticarapida_passi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff legge i passi" ON public.praticarapida_passi;
CREATE POLICY "staff legge i passi"
  ON public.praticarapida_passi FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

COMMENT ON TABLE public.praticarapida_passi IS
  'Imbuto del cliente privato di Pratica Rapida: quale passo ha raggiunto ogni visita anonima.';
