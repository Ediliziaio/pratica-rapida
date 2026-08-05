-- Prezzo della pratica ENEA quando la richiesta arriva da un CLIENTE PRIVATO
-- dal sito (/area-riservata-vecchia/pratica-enea).
--
-- Il rivenditore continua a non pagare nulla al momento dell'invio: per lui
-- vale la fatturazione concordata (company_pricing). Solo il privato che
-- richiede la pratica per sé paga subito con carta.
--
-- L'importo NON viene mai preso dal browser: `stripe-checkout` lo rilegge da
-- qui prima di creare la Checkout Session. Senza questo, chiunque potrebbe
-- modificare `amount_cents` dal client e pagare 1€ invece del dovuto.
--
-- Valori in CENTESIMI (niente float: 150.00 * 1.22 in floating point non fa
-- esattamente 183). Totale = round(imponibile * (1 + iva/100)).
--   150,00 € imponibile + 22% IVA = 183,00 €  → 18300 cent
--
-- `attivo` è la valvola di sicurezza: a false il percorso privato sparisce dal
-- form pubblico e `stripe-checkout` rifiuta, senza bisogno di un deploy.

INSERT INTO public.platform_settings (key, value)
VALUES (
  'prezzo_privato_enea',
  '{"imponibile_cents": 15000, "iva_percent": 22, "attivo": true}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Il form pubblico è anonimo (nessun login) ma deve mostrare l'importo sul
-- bottone prima di mandare l'utente su Stripe. Diamo al ruolo `anon` la
-- lettura di QUESTA SOLA chiave: il resto di platform_settings (SLA, config
-- integrazioni, ecc.) resta riservato agli utenti autenticati.
DROP POLICY IF EXISTS "Anon reads public pricing" ON public.platform_settings;
CREATE POLICY "Anon reads public pricing"
ON public.platform_settings FOR SELECT TO anon
USING (key = 'prezzo_privato_enea');
