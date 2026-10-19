-- La chat vera: una conversazione, con i suoi messaggi, che il cliente vede
-- comparire dove ha scritto.
--
-- Prima la chat prometteva una chat e consegnava una mail. Il titolare l'ha
-- detto con precisione il 19/10/2026: «non posso scrivere sulla chat e
-- ricevere una risposta sulla mail».
--
-- Nasce per due marchi, non per uno: la colonna `marchio` c'e' dal primo
-- giorno perche' lo stesso meccanismo servira' anche a Pratica Rapida, e
-- aggiungerla dopo vorrebbe dire rimettere le mani a tutto. I dati restano
-- separati: dall'esterno i due marchi non si toccano.

CREATE TABLE IF NOT EXISTS public.chat_conversazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marchio text NOT NULL CHECK (marchio IN ('eneasubito', 'praticarapida')),
  -- Il segreto che il browser del cliente tiene da parte: e' l'unica cosa
  -- che gli permette di rileggere la SUA conversazione e nessun'altra.
  -- Non e' un accesso: non sappiamo chi sia, e non vogliamo saperlo finche'
  -- non ce lo dice lui.
  chiave uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  -- Lasciata solo se la vuole lasciare: serve a riprenderlo se se ne va
  -- prima della risposta.
  email text,
  -- Da quale pagina ha aperto la chat: dice di cosa stava leggendo.
  pagina text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- L'ultimo messaggio, di chiunque: serve a mettere in cima quelle vive.
  ultimo_at timestamptz NOT NULL DEFAULT now(),
  -- Quando l'operatore l'ha aperta, e quando ha considerato chiusa la
  -- faccenda. Due momenti diversi: il secondo e' quello che spegne il
  -- numerino.
  visto_at timestamptz,
  chiusa_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.chat_messaggi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversazione_id uuid NOT NULL
    REFERENCES public.chat_conversazioni(id) ON DELETE CASCADE,
  -- Chi parla: il cliente, l'operatore, oppure il copione delle risposte
  -- gia' pronte (che un domani sara' l'AI). Tre voci distinte perche' il
  -- cliente deve sempre sapere con chi sta parlando.
  da text NOT NULL CHECK (da IN ('cliente', 'operatore', 'automatico')),
  testo text NOT NULL CHECK (length(btrim(testo)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messaggi_conversazione
  ON public.chat_messaggi (conversazione_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_conversazioni_vive
  ON public.chat_conversazioni (ultimo_at DESC)
  WHERE chiusa_at IS NULL;

-- Il cliente non tocca mai queste tabelle: passa sempre dalla funzione
-- `chat-cliente`, che gira con la chiave di servizio e conosce la sua
-- chiave. Dal browser anonimo non si legge e non si scrive niente: senza
-- questo, chi indovinasse un indirizzo leggerebbe le conversazioni altrui.
ALTER TABLE public.chat_conversazioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messaggi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff legge le conversazioni" ON public.chat_conversazioni;
CREATE POLICY "staff legge le conversazioni"
  ON public.chat_conversazioni FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

DROP POLICY IF EXISTS "staff aggiorna le conversazioni" ON public.chat_conversazioni;
CREATE POLICY "staff aggiorna le conversazioni"
  ON public.chat_conversazioni FOR UPDATE TO authenticated
  USING (public.is_internal(auth.uid()))
  WITH CHECK (public.is_internal(auth.uid()));

DROP POLICY IF EXISTS "staff legge i messaggi" ON public.chat_messaggi;
CREATE POLICY "staff legge i messaggi"
  ON public.chat_messaggi FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

DROP POLICY IF EXISTS "staff scrive i messaggi" ON public.chat_messaggi;
CREATE POLICY "staff scrive i messaggi"
  ON public.chat_messaggi FOR INSERT TO authenticated
  WITH CHECK (public.is_internal(auth.uid()));

-- Il tempo dell'ultimo messaggio si tiene aggiornato da solo: se dipendesse
-- da chi scrive, prima o poi qualcuno si dimenticherebbe e la conversazione
-- sparirebbe in fondo all'elenco.
CREATE OR REPLACE FUNCTION public.chat_tocca_conversazione()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_conversazioni
     SET ultimo_at = NEW.created_at
   WHERE id = NEW.conversazione_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_tocca_conversazione ON public.chat_messaggi;
CREATE TRIGGER trg_chat_tocca_conversazione
  AFTER INSERT ON public.chat_messaggi
  FOR EACH ROW EXECUTE FUNCTION public.chat_tocca_conversazione();

COMMENT ON TABLE public.chat_conversazioni IS
  'Conversazioni della chat del sito, per marchio. Il cliente le raggiunge solo con la sua chiave, via la funzione chat-cliente.';
COMMENT ON TABLE public.chat_messaggi IS
  'I messaggi di una conversazione: cliente, operatore o risposta automatica.';
