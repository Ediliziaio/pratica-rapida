-- Accettazione del contratto di servizio da parte del rivenditore, per
-- singola pratica. Serve come prova: chi inserisce la pratica dal portale
-- accetta le condizioni, e qui resta registrato quando e quale versione.
alter table public.enea_practices
  add column if not exists contratto_accettato_at timestamptz,
  add column if not exists contratto_versione text;

comment on column public.enea_practices.contratto_accettato_at is
  'Momento in cui il rivenditore ha accettato il contratto di servizio inviando la pratica. NULL per le pratiche precedenti all''obbligo.';
comment on column public.enea_practices.contratto_versione is
  'Versione del contratto di servizio accettata al momento dell''invio.';
