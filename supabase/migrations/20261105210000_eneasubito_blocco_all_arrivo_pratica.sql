-- EneaSubito: il blocco della carta parte quando arriva la pratica.
--
-- Decisione del Titolare del 05/11/2026. Il blocco dura circa 7 giorni e non
-- si puo' spostare: messo alla cassa, scade se il cliente manda i dati dopo.
-- Ora alla cassa la carta si salva, e il blocco parte quando la pratica
-- risulta compilata. `carta_bloccata_at` resta il segno «ha lasciato la
-- carta», che CRM e solleciti gia' leggono; non vuol dire pagata.
--
-- Rieseguibile.

ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS stripe_cliente text,
  ADD COLUMN IF NOT EXISTS stripe_metodo_pagamento text;

COMMENT ON COLUMN public.enea_practices.stripe_cliente IS
  'EneaSubito: la scheda Stripe del cliente su cui e'' salvata la carta.';
COMMENT ON COLUMN public.enea_practices.stripe_metodo_pagamento IS
  'EneaSubito: la carta salvata alla cassa. Non vuol dire pagata.';

-- Un errore qui non deve mai impedire di mandare la pratica: resta un warning.
CREATE OR REPLACE FUNCTION public.eneasubito_blocca_all_arrivo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
begin
  if NEW.canale is distinct from 'eneasubito'
     or NEW.pagamento_stato = 'pagata'
     or NEW.form_compilato_at is null
     or NEW.stripe_metodo_pagamento is null
     or NEW.stripe_payment_intent is not null
     or (OLD.form_compilato_at is not null and OLD.stripe_metodo_pagamento is not null) then
    return NEW;
  end if;

  begin
    perform net.http_post(
      url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/eneasubito-blocca',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-solleciti-chiave', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'solleciti_chiave' limit 1
        )
      ),
      body := jsonb_build_object('pratica_id', NEW.id),
      timeout_milliseconds := 60000
    );
  exception when others then
    raise warning 'EneaSubito: blocco della pratica % non avviato (%)', NEW.id, sqlerrm;
  end;

  return NEW;
end;
$$;

REVOKE ALL ON FUNCTION public.eneasubito_blocca_all_arrivo() FROM public;
REVOKE ALL ON FUNCTION public.eneasubito_blocca_all_arrivo() FROM anon;

DROP TRIGGER IF EXISTS eneasubito_blocca_all_arrivo ON public.enea_practices;
CREATE TRIGGER eneasubito_blocca_all_arrivo
  AFTER UPDATE OF form_compilato_at, stripe_metodo_pagamento ON public.enea_practices
  FOR EACH ROW
  EXECUTE FUNCTION public.eneasubito_blocca_all_arrivo();

NOTIFY pgrst, 'reload schema';
