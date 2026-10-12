-- Da dove arriva ogni pratica di EneaSubito.
--
-- Il Titolare si e' dato un tetto di 20 € di pubblicita' per pratica. Senza
-- questa colonna quel tetto non e' applicabile: a fine mese si sa quanto si e'
-- speso e quante pratiche sono entrate, ma non quali soldi hanno portato quali
-- pratiche, e si finisce per spegnere la campagna che rendeva.
--
-- Dentro ci vanno solo fatti grezzi, ripuliti e di lunghezza limitata dalla
-- funzione eneasubito-verifica: il parametro che abbiamo messo noi
-- nell'annuncio e il NOME del sito di partenza. Mai l'indirizzo completo di
-- una ricerca, che contiene quello che una persona ha digitato. La traduzione
-- in lingua leggibile si fa al momento di leggerla (src/lib/eneasubito-
-- provenienza.ts), cosi' una regola migliore vale anche per le pratiche
-- gia' registrate.
--
-- Cambiamento additivo e gated agli operatori interni, come `canale`.
-- ATTENZIONE: il corpo della view qui sotto NON e' inventato, e' quello vivo
-- in produzione con una colonna in piu'. CREATE OR REPLACE VIEW pretende lo
-- stesso ordine di colonne: se il comando viene rifiutato, rileggere la
-- definizione vera con
--   select pg_get_viewdef('public.enea_practices_public'::regclass, true);
-- e ricostruirla da li'. Un rifiuto non modifica niente.

ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS provenienza jsonb;

COMMENT ON COLUMN public.enea_practices.provenienza IS
  'Da dove e'' arrivato il cliente (solo canale eneasubito): utm, gclid, nome del sito di partenza. Primo tocco, scritto alla nascita e mai piu'' modificato. Solo uso interno.';

-- Le righe si contano per mese e per provenienza: senza indice, ogni apertura
-- del cruscotto rileggerebbe tutta la tabella.
CREATE INDEX IF NOT EXISTS enea_practices_provenienza_idx
  ON public.enea_practices USING gin (provenienza)
  WHERE provenienza IS NOT NULL;

CREATE OR REPLACE VIEW public.enea_practices_public
WITH (security_invoker = true) AS
SELECT id,
    reseller_id,
    current_stage_id,
    brand,
    cliente_nome,
    cliente_cognome,
    cliente_email,
    cliente_telefono,
    cliente_indirizzo,
    cliente_cf,
    prodotto_installato,
    fornitore,
    note,
        CASE
            WHEN is_internal(auth.uid()) THEN note_interne
            ELSE NULL::text
        END AS note_interne,
    fatture_urls,
    documenti_enea_urls,
    documenti_aggiuntivi_urls,
    documenti_mancanti,
    note_documenti_mancanti,
        CASE
            WHEN is_internal(auth.uid()) THEN guadagno_lordo
            ELSE NULL::numeric
        END AS guadagno_lordo,
        CASE
            WHEN is_internal(auth.uid()) THEN guadagno_netto
            ELSE NULL::numeric
        END AS guadagno_netto,
        CASE
            WHEN is_internal(auth.uid()) THEN note_gestionale
            ELSE NULL::text
        END AS note_gestionale,
    data_invio_pratica,
    operatore_id,
    assigned_at,
    ultimo_sollecito_privato,
    conteggio_solleciti,
    ultimo_sollecito_fornitore,
    form_compilato_at,
        CASE
            WHEN is_internal(auth.uid()) THEN form_token
            WHEN reseller_id = get_reseller_company_id(auth.uid()) THEN form_token
            ELSE NULL::text
        END AS form_token,
    recensione_richiesta_at,
    recensione_ricevuta_at,
    recensione_testo,
    recensione_stelle,
    archived_at,
    created_at,
    updated_at,
    current_stage_entered_at,
    pratica_enea_conclusa_urls,
        CASE
            WHEN is_internal(auth.uid()) THEN tipo_fatturazione
            ELSE NULL::text
        END AS tipo_fatturazione,
        CASE
            WHEN is_internal(auth.uid()) THEN tipo_servizio
            ELSE NULL::text
        END AS tipo_servizio,
    tipo_soggetto,
    archivio_path,
        CASE
            WHEN is_internal(auth.uid()) THEN prezzo
            ELSE NULL::numeric
        END AS prezzo,
        CASE
            WHEN is_internal(auth.uid()) THEN pagamento_stato
            ELSE NULL::pagamento_stato
        END AS pagamento_stato,
        CASE
            WHEN is_internal(auth.uid()) THEN data_incasso
            ELSE NULL::timestamp with time zone
        END AS data_incasso,
        CASE
            WHEN is_internal(auth.uid()) THEN dati_form
            WHEN reseller_id = get_reseller_company_id(auth.uid()) THEN dati_form
            ELSE '{}'::jsonb
        END AS dati_form,
        CASE
            WHEN is_internal(auth.uid()) THEN azienda_dichiarata
            ELSE NULL::text
        END AS azienda_dichiarata,
        CASE
            WHEN is_internal(auth.uid()) THEN chiamate_assegnato_a
            ELSE NULL::text
        END AS chiamate_assegnato_a,
    data_fine_lavori,
        CASE
            WHEN is_internal(auth.uid()) THEN canale
            ELSE NULL::text
        END AS canale,
        CASE
            WHEN is_internal(auth.uid()) THEN provenienza
            ELSE NULL::jsonb
        END AS provenienza
   FROM enea_practices ep;

GRANT SELECT ON public.enea_practices_public TO authenticated;

NOTIFY pgrst, 'reload schema';
