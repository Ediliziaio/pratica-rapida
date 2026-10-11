-- Il messaggio per il cruscotto porta anche il canale.
--
-- Sul cruscotto i nomi dei clienti arrivano divisi per fornitore, pronti per
-- le fatture di fine mese. Le pratiche di EneaSubito non vanno in quelle
-- fatture: le fattura Stripe a nome della LLC, una per cliente, al momento del
-- pagamento. Senza il canale nel messaggio il cruscotto non ha modo di
-- tenerle da parte, perche' il loro rivenditore e' la company dei privati,
-- indistinguibile dalle altre pratiche dei clienti finali.
--
-- Cambiamento additivo: una colonna in piu' sulla tabella-messaggio e lo
-- stesso valore scritto dal trigger. Nessuna colonna rimossa, nessuna riga
-- esistente toccata, nessuna condizione del trigger cambiata: le pratiche di
-- Pratica Rapida continuano a essere segnalate esattamente come prima, con
-- canale vuoto.

ALTER TABLE public.cruscotto_pratiche_da_crm
  ADD COLUMN IF NOT EXISTS canale text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.cruscotto_pratiche_da_crm.canale IS
  'Canale di provenienza della pratica: '''' (Pratica Rapida) | ''eneasubito'' (fatturata da Stripe, fuori dalle fatture mensili ai fornitori).';

-- Trigger: identico a 20260731120000_ponte_cruscotto.sql, con in coda il
-- canale. Qualsiasi errore resta un warning, come prima: spostare una pratica
-- non deve mai rompersi per colpa del cruscotto.
CREATE OR REPLACE FUNCTION public.cruscotto_segnala_pratica_gestionale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_e_gestionale boolean;
begin
  if TG_OP = 'UPDATE'
     and NEW.current_stage_id is not distinct from OLD.current_stage_id then
    return NEW;
  end if;

  if NEW.current_stage_id is null or NEW.archived_at is not null then
    return NEW;
  end if;

  select exists (
    select 1
    from public.pipeline_stages s
    where s.id = NEW.current_stage_id
      and s.stage_type = 'gestionale'
  ) into v_e_gestionale;

  if not v_e_gestionale then
    return NEW;
  end if;

  begin
    insert into public.cruscotto_pratiche_da_crm (
      crm_pratica_id,
      crm_reseller_id,
      rivenditore_nome,
      rivenditore_email,
      cliente_nome,
      cliente_cognome,
      brand,
      canale,
      entrato_in_stage_at
    )
    select
      NEW.id,
      NEW.reseller_id,
      coalesce(c.ragione_sociale, ''),
      coalesce(c.email, ''),
      coalesce(NEW.cliente_nome, ''),
      coalesce(NEW.cliente_cognome, ''),
      coalesce(NEW.brand::text, ''),
      coalesce(NEW.canale, ''),
      coalesce(NEW.current_stage_entered_at, now())
    from (select 1) as dummy
    left join public.companies c on c.id = NEW.reseller_id
    on conflict (crm_pratica_id) do nothing;
  exception when others then
    raise warning 'Ponte cruscotto: pratica % non segnalata (%)', NEW.id, sqlerrm;
  end;

  return NEW;
end;
$$;

REVOKE ALL ON FUNCTION public.cruscotto_segnala_pratica_gestionale() FROM public;
REVOKE ALL ON FUNCTION public.cruscotto_segnala_pratica_gestionale() FROM anon;

NOTIFY pgrst, 'reload schema';
