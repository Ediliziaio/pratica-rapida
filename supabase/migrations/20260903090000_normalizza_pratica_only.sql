-- Normalizza il valore legacy 'pratica_only' -> 'documenti_forniti'.
--
-- 'pratica_only' era il nome originale del servizio "documenti forniti"
-- (20260327000005_add_tipo_servizio.sql). Dopo la rinomina i guard che
-- impediscono di contattare il cliente finale sono stati scritti confrontando
-- SOLO la stringa nuova: una pratica rimasta col nome vecchio passava quei
-- controlli come se fosse "servizio completo" e al cliente privato — che con i
-- documenti forniti non va mai contattato — potevano partire email e WhatsApp,
-- inclusa la mail con la pratica ENEA allegata.
--
-- Le edge function adesso riconoscono entrambi i valori
-- (supabase/functions/_shared/contatto-cliente.ts), ma il dato resta ambiguo
-- finché convivono due nomi per lo stesso servizio: qui lo si allinea a uno solo.
UPDATE enea_practices
   SET tipo_servizio = 'documenti_forniti'
 WHERE tipo_servizio = 'pratica_only';

-- Tolto 'pratica_only' dai valori ammessi: nessuna riga può più nascere col
-- nome vecchio, nemmeno da un client non aggiornato.
ALTER TABLE enea_practices
  DROP CONSTRAINT IF EXISTS enea_practices_tipo_servizio_check;

ALTER TABLE enea_practices
  ADD CONSTRAINT enea_practices_tipo_servizio_check
  CHECK (tipo_servizio IN ('servizio_completo', 'documenti_forniti'));

COMMENT ON COLUMN enea_practices.tipo_servizio IS
  'servizio_completo = Pratica Rapida raccoglie i documenti e contatta il cliente finale; documenti_forniti = il rivenditore fornisce tutto e il cliente finale non va MAI contattato (unica eccezione: invia_pratica_al_cliente). Il valore storico pratica_only e'' stato normalizzato in documenti_forniti il 2026-09-03.';
