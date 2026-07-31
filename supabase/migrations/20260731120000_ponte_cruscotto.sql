-- ============================================================
-- PONTE CRM -> CRUSCOTTO
--
-- Quando una pratica entra nella colonna "Da inserire su Excel"
-- il CRM lascia un messaggio per il cruscotto: rivenditore e
-- nome del cliente finale. Il cruscotto lo legge e crea la sua
-- pratica applicando le proprie regole di prezzo e omaggi.
--
-- Perche una tabella-messaggio e non una semplice vista: il
-- passaggio di colonna e un EVENTO. Una vista mostrerebbe solo
-- le pratiche che stanno in quella colonna ADESSO, quindi una
-- pratica spostata avanti prima che il cruscotto la legga
-- andrebbe persa. La riga qui invece resta.
--
-- Il CRM scrive e basta: non sa come il cruscotto calcola
-- prezzi e omaggi, e non deve saperlo.
-- ============================================================

create table if not exists public.cruscotto_pratiche_da_crm (
  id                    uuid primary key default gen_random_uuid(),

  -- Riferimenti al CRM. Nessuna foreign key: i due progetti
  -- restano indipendenti, come per le altre tabelle cruscotto_.
  crm_pratica_id        uuid not null unique,
  crm_reseller_id       uuid,

  -- Quello che il CRM comunica.
  rivenditore_nome      text not null default '',
  rivenditore_email     text not null default '',
  cliente_nome          text not null default '',
  cliente_cognome       text not null default '',
  brand                 text not null default '',

  entrato_in_stage_at   timestamptz not null default now(),
  ricevuto_at           timestamptz not null default now(),

  -- Ciclo di vita lato cruscotto.
  stato                 text not null default 'da_importare',
  cruscotto_pratica_id  uuid,
  importata_at          timestamptz,
  nota                  text not null default '',

  constraint cruscotto_pratiche_da_crm_stato_valido
    check (stato in ('da_importare', 'importata', 'ignorata'))
);

comment on table public.cruscotto_pratiche_da_crm is
  'Messaggi dal CRM al cruscotto: pratiche entrate nella colonna "Da inserire su Excel". Scritta dal CRM, letta e aggiornata dal cruscotto.';

create index if not exists cruscotto_pratiche_da_crm_da_importare_idx
  on public.cruscotto_pratiche_da_crm (entrato_in_stage_at desc)
  where stato = 'da_importare';

-- ── Chi puo vederla: solo il titolare, come il resto del cruscotto ──
alter table public.cruscotto_pratiche_da_crm enable row level security;
alter table public.cruscotto_pratiche_da_crm force row level security;

drop policy if exists cruscotto_pratiche_da_crm_super_admin
  on public.cruscotto_pratiche_da_crm;

create policy cruscotto_pratiche_da_crm_super_admin
  on public.cruscotto_pratiche_da_crm
  for all to authenticated
  using (public.cruscotto_is_owner())
  with check (public.cruscotto_is_owner());

revoke all on public.cruscotto_pratiche_da_crm from anon;
grant select, insert, update, delete
  on public.cruscotto_pratiche_da_crm to authenticated;

-- ── Il messaggio ──
create or replace function public.cruscotto_segnala_pratica_gestionale()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_e_gestionale boolean;
begin
  -- Su UPDATE interessa solo il momento in cui la colonna cambia.
  if TG_OP = 'UPDATE'
     and NEW.current_stage_id is not distinct from OLD.current_stage_id then
    return NEW;
  end if;

  if NEW.current_stage_id is null or NEW.archived_at is not null then
    return NEW;
  end if;

  -- Si aggancia al TIPO della colonna, non al nome: se un giorno
  -- "Da inserire su Excel" viene rinominata, il ponte regge.
  select exists (
    select 1
    from public.pipeline_stages s
    where s.id = NEW.current_stage_id
      and s.stage_type = 'gestionale'
  ) into v_e_gestionale;

  if not v_e_gestionale then
    return NEW;
  end if;

  -- Da qui in poi nulla puo fermare il CRM: se la scrittura del
  -- messaggio fallisce si registra un avviso e si tira dritto.
  -- Spostare una pratica non deve MAI rompersi per colpa del
  -- cruscotto.
  begin
    insert into public.cruscotto_pratiche_da_crm (
      crm_pratica_id,
      crm_reseller_id,
      rivenditore_nome,
      rivenditore_email,
      cliente_nome,
      cliente_cognome,
      brand,
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

comment on function public.cruscotto_segnala_pratica_gestionale() is
  'Avvisa il cruscotto quando una pratica entra in una colonna di tipo gestionale ("Da inserire su Excel"). Non puo bloccare il CRM: gli errori diventano warning.';

revoke all on function public.cruscotto_segnala_pratica_gestionale() from public;
revoke all on function public.cruscotto_segnala_pratica_gestionale() from anon;

drop trigger if exists cruscotto_segnala_pratica_gestionale_trg
  on public.enea_practices;

create trigger cruscotto_segnala_pratica_gestionale_trg
  after insert or update of current_stage_id
  on public.enea_practices
  for each row
  execute function public.cruscotto_segnala_pratica_gestionale();
