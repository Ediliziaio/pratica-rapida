-- EneaSubito: «paghi solo quando la pratica è inviata».
--
-- Decisione del Titolare del 21/10/2026. Alla cassa Stripe BLOCCA i 99 €
-- sulla carta senza addebitarli; l'addebito parte quando la pratica viene
-- spostata in «Da inserire su Excel» (stage_type `gestionale`), cioè dopo
-- che la pratica è stata mandata al cliente. Se il blocco è scaduto (la
-- banca lo tiene circa 7 giorni), al cliente parte un link per pagare.
--
-- La pratica resta «non_pagata» finché non si incassa davvero: la carta
-- bloccata si legge da `carta_bloccata_at`. Così il resto del CRM, i conti
-- e le fatture mensili non cambiano significato.
--
-- Rieseguibile.

ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS stripe_payment_intent text,
  ADD COLUMN IF NOT EXISTS carta_bloccata_at timestamptz;

COMMENT ON COLUMN public.enea_practices.stripe_payment_intent IS
  'EneaSubito: il pagamento Stripe con la carta bloccata, da incassare alla consegna.';
COMMENT ON COLUMN public.enea_practices.carta_bloccata_at IS
  'EneaSubito: quando Stripe ha bloccato i 99 € sulla carta. Non vuol dire pagata.';

-- Lo spostamento in «Da inserire su Excel» chiama la funzione che incassa.
-- Un errore qui non deve mai impedire di spostare la pratica: resta un warning,
-- e la funzione si può richiamare a mano.
CREATE OR REPLACE FUNCTION public.eneasubito_incassa_alla_consegna()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_e_gestionale boolean;
begin
  if NEW.canale is distinct from 'eneasubito'
     or NEW.pagamento_stato = 'pagata'
     or NEW.carta_bloccata_at is null
     or NEW.current_stage_id is null
     or NEW.current_stage_id is not distinct from OLD.current_stage_id then
    return NEW;
  end if;

  select exists (
    select 1 from public.pipeline_stages s
    where s.id = NEW.current_stage_id and s.stage_type = 'gestionale'
  ) into v_e_gestionale;
  if not v_e_gestionale then
    return NEW;
  end if;

  begin
    perform net.http_post(
      url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/eneasubito-incassa',
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
    raise warning 'EneaSubito: incasso della pratica % non avviato (%)', NEW.id, sqlerrm;
  end;

  return NEW;
end;
$$;

REVOKE ALL ON FUNCTION public.eneasubito_incassa_alla_consegna() FROM public;
REVOKE ALL ON FUNCTION public.eneasubito_incassa_alla_consegna() FROM anon;

DROP TRIGGER IF EXISTS eneasubito_incassa_alla_consegna ON public.enea_practices;
CREATE TRIGGER eneasubito_incassa_alla_consegna
  AFTER UPDATE OF current_stage_id ON public.enea_practices
  FOR EACH ROW
  EXECUTE FUNCTION public.eneasubito_incassa_alla_consegna();

NOTIFY pgrst, 'reload schema';
