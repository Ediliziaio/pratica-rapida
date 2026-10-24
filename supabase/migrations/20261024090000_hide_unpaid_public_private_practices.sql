-- La richiesta privata del sito deve esistere per il modulo e il pagamento,
-- ma non deve comparire nel CRM prima dell'incasso confermato. Non si applica
-- ai clienti finali inseriti da un rivenditore: il loro lavoro segue un
-- contratto di fatturazione diverso e puo' essere visibile prima del pagamento.
ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS public_private_checkout_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.enea_practices.public_private_checkout_required IS
  'Richiesta privata creata dal sito: invisibile agli utenti CRM finche il pagamento non risulta pagata; il form tokenizzato e i webhook continuano a funzionare.';

-- Recupera anche le richieste private gia' create dal sito (fra cui quelle
-- abbandonate prima di aprire la pagina di pagamento).
UPDATE public.enea_practices
SET public_private_checkout_required = true
WHERE public_private_checkout_required = false
  AND tipo_fatturazione = 'cliente_finale'
  AND note LIKE '📥 RICHIESTA DAL SITO — CLIENTE PRIVATO%';

DROP POLICY IF EXISTS "Public private checkout visible only after payment" ON public.enea_practices;
CREATE POLICY "Public private checkout visible only after payment"
  ON public.enea_practices
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public_private_checkout_required
    OR pagamento_stato = 'pagata'
  );

-- Le vecchie notifiche generate al momento della richiesta avrebbero ancora
-- un link a una pratica nascosta. Rimuoviamo solo quelle premature, mai le
-- notifiche di pagamento o le richieste di altri canali.
DELETE FROM public.notifications AS n
USING public.enea_practices AS p
WHERE p.public_private_checkout_required = true
  AND p.pagamento_stato IS DISTINCT FROM 'pagata'
  AND n.tipo = 'richiesta_pubblica'
  AND n.link = '/pratiche/' || p.id::text;
