-- =============================================
-- Cruscotto economico esterno (UlberetaWay)
-- =============================================
-- Coda di sincronizzazione verso il cruscotto economico esterno, un'app
-- SEPARATA da questo repo (repo ulbereta/ulberetaway, deploy su
-- ulberetaway.vercel.app) riservata al titolare.
--
-- CONTRATTO: quando una pratica entra nello stage "Da inserire su Excel"
-- (stage_type = 'gestionale' — il name UI è stato rinominato in
-- 20260424000011, l'enum NO), un trigger inserisce qui una riga con i
-- soli dati che servono al cruscotto: rivenditore + nome/cognome cliente.
-- Il cruscotto all'apertura legge le righe con consumed_at IS NULL, le
-- importa nella propria contabilità (che resta in localStorage, fuori da
-- questo DB) e le marca consumate.
--
-- Il flusso è PULL, non push: il CRM non può raggiungere un browser
-- chiuso, quindi deposita qui e il cruscotto pesca quando è aperto.
-- Questa tabella è l'UNICO punto di contatto tra i due progetti.
--
-- ACCESSO: il cruscotto si autentica con le credenziali CRM del
-- super_admin (modulistica@praticarapida.it) — nessun utente o ruolo
-- dedicato. Lato server basta quindi is_internal(); il vincolo "solo
-- quell'account" è applicato dall'app cruscotto (AuthGate), e i dati qui
-- esposti sono comunque un sottoinsieme di ciò che lo staff interno vede
-- già nel CRM.

CREATE TABLE public.cruscotto_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE: una pratica entra in coda una volta sola, anche se rimbalza
  -- più volte dentro/fuori lo stage (ON CONFLICT DO NOTHING nel trigger).
  -- CASCADE: pratica eliminata dal CRM → sparisce anche dalla coda.
  practice_id UUID NOT NULL UNIQUE REFERENCES public.enea_practices(id) ON DELETE CASCADE,
  reseller_id UUID NOT NULL REFERENCES public.companies(id),
  -- Denormalizzato al momento della chiusura: il nome storico è quello
  -- giusto per i report, anche se l'azienda viene poi rinominata.
  reseller_nome TEXT NOT NULL,
  cliente_nome TEXT NOT NULL,
  cliente_cognome TEXT NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Valorizzato dal cruscotto dopo l'import. NULL = da importare.
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cruscotto_sync_queue IS
  'Coda pratiche chiuse (stage gestionale/"Da inserire su Excel") in attesa di import nel cruscotto economico esterno UlberetaWay. Unico punto di contatto tra CRM e cruscotto.';

-- La query tipica del cruscotto: righe pendenti, dalla più vecchia.
CREATE INDEX idx_cruscotto_queue_pending
  ON public.cruscotto_sync_queue (closed_at)
  WHERE consumed_at IS NULL;

-- ── Trigger: pratica → stage 'gestionale' ⇒ accoda ────────────────────
-- Trigger DB (non edge function): scatta su QUALUNQUE percorso porti la
-- pratica nello stage — drag&drop kanban, automazioni via service role,
-- update manuale — senza dipendere da chi chiama cosa.

CREATE OR REPLACE FUNCTION public.enqueue_cruscotto_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_type public.stage_type;
  v_reseller_nome TEXT;
BEGIN
  IF NEW.current_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Solo su cambio stage effettivo (l'UPDATE OF limita già, ma un update
  -- che riscrive lo stesso stage non deve riaccodare).
  IF TG_OP = 'UPDATE' AND NEW.current_stage_id IS NOT DISTINCT FROM OLD.current_stage_id THEN
    RETURN NEW;
  END IF;

  SELECT stage_type INTO v_stage_type
  FROM public.pipeline_stages
  WHERE id = NEW.current_stage_id;

  IF v_stage_type IS DISTINCT FROM 'gestionale'::public.stage_type THEN
    RETURN NEW;
  END IF;

  SELECT ragione_sociale INTO v_reseller_nome
  FROM public.companies
  WHERE id = NEW.reseller_id;

  INSERT INTO public.cruscotto_sync_queue
    (practice_id, reseller_id, reseller_nome, cliente_nome, cliente_cognome, closed_at)
  VALUES
    (NEW.id, NEW.reseller_id, COALESCE(v_reseller_nome, ''), NEW.cliente_nome, NEW.cliente_cognome, now())
  ON CONFLICT (practice_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- AFTER (non BEFORE): non modifica la riga pratica; INSERT incluso per la
-- pratica creata direttamente nello stage finale (caso raro ma possibile).
CREATE TRIGGER trg_enqueue_cruscotto_sync
  AFTER INSERT OR UPDATE OF current_stage_id ON public.enea_practices
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_cruscotto_sync();

-- ── RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.cruscotto_sync_queue ENABLE ROW LEVEL SECURITY;

-- Staff interno (super_admin + operatore): lettura e gestione. Il
-- cruscotto entra come super_admin e rientra qui. Nessun'altra policy:
-- rivenditori e aziende non vedono la coda.
CREATE POLICY "Internal manage cruscotto queue"
  ON public.cruscotto_sync_queue FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()))
  WITH CHECK (public.is_internal(auth.uid()));

-- ── Grants ────────────────────────────────────────────────────────────
-- anon non deve vedere la coda (contiene nomi di clienti reali).
REVOKE ALL ON public.cruscotto_sync_queue FROM anon;
-- authenticated: UPDATE limitato alla colonna consumed_at — i dati
-- denormalizzati non si riscrivono; per correggerli si cancella la riga
-- e si rifà il passaggio di stage.
REVOKE UPDATE ON public.cruscotto_sync_queue FROM authenticated;
GRANT UPDATE (consumed_at) ON public.cruscotto_sync_queue TO authenticated;
