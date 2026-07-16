-- documenti.caricato_da: da NOT NULL a nullable.
--
-- La Dichiarazione Requisiti Tecnici viene generata dal server (on-stage-changed,
-- quando la pratica entra in "recensione"): non c'è nessun utente che la carica,
-- quindi non c'è un auth.users a cui attribuirla. Fingere un caricatore (es. il
-- primo super_admin) sarebbe un dato falso su un documento legale.
--
-- NULL = generato automaticamente dal sistema.
--
-- Effetto sulle policy: "Company users delete own documents" usa
-- `caricato_da = auth.uid() OR has_role(super_admin)`. Con caricato_da NULL il
-- confronto è NULL (mai vero), quindi i documenti di sistema restano
-- cancellabili solo dal super_admin — che è il comportamento voluto: il
-- rivenditore non deve poter cancellare la propria dichiarazione.
ALTER TABLE public.documenti
  ALTER COLUMN caricato_da DROP NOT NULL;

COMMENT ON COLUMN public.documenti.caricato_da IS
  'Utente che ha caricato il documento. NULL = generato automaticamente dal sistema (es. Dichiarazione Requisiti Tecnici allo stage "recensione").';
