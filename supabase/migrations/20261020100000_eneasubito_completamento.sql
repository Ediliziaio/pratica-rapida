-- I messaggi a chi ha pagato e non ha finito di compilare.
--
-- Scoperto il 20/10/2026: il secondo cliente pagante si e' fermato sul modulo
-- tecnico, e nessuno lo richiamava — i solleciti di ripresa si fermano al
-- pagamento, perche' fino a quel giorno «ha pagato» voleva dire «ha finito».
--
-- Stessa tabella, non una nuova: cambia il motivo per cui si scrive, non il
-- fatto di aver scritto. Serve pero' distinguere le due serie, altrimenti il
-- messaggio 1 di una impedirebbe il messaggio 1 dell'altra.

ALTER TABLE public.eneasubito_solleciti
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'ripresa';

ALTER TABLE public.eneasubito_solleciti
  DROP CONSTRAINT IF EXISTS eneasubito_solleciti_tipo_check;
ALTER TABLE public.eneasubito_solleciti
  ADD CONSTRAINT eneasubito_solleciti_tipo_check
  CHECK (tipo IN ('ripresa', 'completamento'));

-- La rete che impedisce il doppione deve contare anche il tipo.
ALTER TABLE public.eneasubito_solleciti
  DROP CONSTRAINT IF EXISTS eneasubito_solleciti_pratica_id_numero_key;
ALTER TABLE public.eneasubito_solleciti
  DROP CONSTRAINT IF EXISTS eneasubito_solleciti_unico;
ALTER TABLE public.eneasubito_solleciti
  ADD CONSTRAINT eneasubito_solleciti_unico UNIQUE (pratica_id, tipo, numero);

COMMENT ON COLUMN public.eneasubito_solleciti.tipo IS
  'ripresa = non ha ancora pagato; completamento = ha pagato e non ha finito il modulo.';
