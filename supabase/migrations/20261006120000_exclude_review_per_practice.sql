-- Esclusione puntuale delle richieste recensione.
-- Non riutilizziamo recensione_richiesta_at: quel campo registra un evento
-- realmente avvenuto e falsificarlo renderebbe inaffidabile l'audit.
ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS recensione_esclusa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recensione_esclusa_motivo text,
  ADD COLUMN IF NOT EXISTS recensione_esclusa_at timestamptz;

COMMENT ON COLUMN public.enea_practices.recensione_esclusa IS
  'Se true, nessuna richiesta o sollecito recensione puo essere inviato per la pratica.';
COMMENT ON COLUMN public.enea_practices.recensione_esclusa_motivo IS
  'Motivo registrato dell esclusione puntuale dalla richiesta recensione.';
COMMENT ON COLUMN public.enea_practices.recensione_esclusa_at IS
  'Data in cui il Titolare ha escluso la pratica dalle richieste recensione.';

CREATE INDEX IF NOT EXISTS idx_enea_practices_review_followup_candidates
  ON public.enea_practices (recensione_richiesta_at)
  WHERE recensione_esclusa = false AND recensione_ricevuta_at IS NULL;
