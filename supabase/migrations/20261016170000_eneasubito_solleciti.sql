-- I solleciti a chi si e' fermato prima di pagare su EneaSubito.
--
-- Due tabelle e un orologio. La regola che decide quale messaggio tocca sta
-- nel codice (supabase/functions/_shared/eneasubito-solleciti.ts) con i suoi
-- test: qui c'e' solo la memoria di cosa e' gia' partito, che e' la cosa che
-- impedisce il danno peggiore — mandare due volte lo stesso messaggio.

-- ── Cosa e' gia' partito ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eneasubito_solleciti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pratica_id uuid NOT NULL REFERENCES public.enea_practices(id) ON DELETE CASCADE,
  numero smallint NOT NULL CHECK (numero BETWEEN 1 AND 5),
  inviato_at timestamptz NOT NULL DEFAULT now(),
  -- Se la spedizione fallisce si scrive comunque la riga, con il motivo: cosi'
  -- il messaggio non riparte all'infinito ogni ora, e il perche' resta agli
  -- atti invece di finire solo in un registro che nessuno legge.
  errore text,
  -- La rete vera: una pratica non puo' ricevere due volte lo stesso numero,
  -- qualunque cosa faccia il codice sopra.
  UNIQUE (pratica_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_eneasubito_solleciti_pratica
  ON public.eneasubito_solleciti (pratica_id);

-- ── Chi ha chiesto di non ricevere piu' niente ──────────────────────────
-- Per indirizzo e non per pratica: chi si toglie non vuole sentirci, e non
-- gli interessa che la seconda richiesta sia un'altra riga del database.
CREATE TABLE IF NOT EXISTS public.eneasubito_disiscritti (
  email text PRIMARY KEY,
  quando timestamptz NOT NULL DEFAULT now(),
  -- Da quale pratica e' arrivata la disiscrizione: serve solo a capire quale
  -- messaggio l'ha provocata.
  pratica_id uuid REFERENCES public.enea_practices(id) ON DELETE SET NULL
);

-- Le scrive la funzione, che gira con la chiave di servizio; le legge lo
-- staff dal CRM. Nessun accesso anonimo diretto.
ALTER TABLE public.eneasubito_solleciti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eneasubito_disiscritti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff legge i solleciti" ON public.eneasubito_solleciti;
CREATE POLICY "staff legge i solleciti"
  ON public.eneasubito_solleciti FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

DROP POLICY IF EXISTS "staff legge i disiscritti" ON public.eneasubito_disiscritti;
CREATE POLICY "staff legge i disiscritti"
  ON public.eneasubito_disiscritti FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

COMMENT ON TABLE public.eneasubito_solleciti IS
  'Quali dei cinque messaggi di ripresa sono gia'' partiti, per ogni pratica EneaSubito.';
COMMENT ON TABLE public.eneasubito_disiscritti IS
  'Indirizzi che hanno chiesto di non ricevere piu'' messaggi da EneaSubito.';
