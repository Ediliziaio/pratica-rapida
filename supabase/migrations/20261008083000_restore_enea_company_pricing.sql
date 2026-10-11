-- Ripristina il listino ENEA concordato per tutte le aziende reali.
-- Il 07/10/2026 il flusso di inserimento ha iniziato a leggere
-- company_pricing, ma la tabella di produzione era vuota. Il risultato era un
-- blocco prima dell'insert. Le righe esplicite rendono il listino disponibile
-- a tutti i percorsi (form, richiesta pubblica, abbinamento CRM e fatturazione).

INSERT INTO public.company_pricing (company_id, brand, prezzo, note)
SELECT
  c.id,
  'enea',
  CASE
    WHEN lower(c.ragione_sociale) LIKE '%brianza serramenti%' THEN 60
    WHEN lower(c.ragione_sociale) ~ '(^|[^a-z])vans([^a-z]|$)' THEN 60
    WHEN lower(c.ragione_sociale) LIKE '%rinaldi lab%' THEN 75
    ELSE 65
  END,
  'Listino ENEA autorizzato dal Titolare il 07/10/2026; ripristino completo 08/10/2026'
FROM public.companies c
WHERE c.is_active IS DISTINCT FROM false
  AND c.ragione_sociale NOT ILIKE '%Da abbinare%'
  AND c.ragione_sociale NOT ILIKE '%Rivenditore eliminato%'
  AND c.ragione_sociale NOT ILIKE '%Clienti privati%'
ON CONFLICT (company_id, brand) DO NOTHING;

-- Ogni nuova azienda reale deve ricevere subito il prezzo standard. Eventuali
-- accordi speciali vengono registrati esplicitamente in company_pricing e non
-- dipendono da un catalogo legacy che puo essere vuoto.
CREATE OR REPLACE FUNCTION public.ensure_default_enea_company_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM false
     AND NEW.ragione_sociale NOT ILIKE '%Da abbinare%'
     AND NEW.ragione_sociale NOT ILIKE '%Rivenditore eliminato%'
     AND NEW.ragione_sociale NOT ILIKE '%Clienti privati%'
  THEN
    INSERT INTO public.company_pricing (company_id, brand, prezzo, note)
    VALUES (
      NEW.id,
      'enea',
      CASE
        WHEN lower(NEW.ragione_sociale) LIKE '%brianza serramenti%' THEN 60
        WHEN lower(NEW.ragione_sociale) ~ '(^|[^a-z])vans([^a-z]|$)' THEN 60
        WHEN lower(NEW.ragione_sociale) LIKE '%rinaldi lab%' THEN 75
        ELSE 65
      END,
      'Listino ENEA iniziale automatico'
    )
    ON CONFLICT (company_id, brand) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_default_enea_company_pricing_after_insert ON public.companies;
CREATE TRIGGER ensure_default_enea_company_pricing_after_insert
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_default_enea_company_pricing();
