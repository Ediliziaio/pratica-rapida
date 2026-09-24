-- ============================================================
-- Switch di produzione 24/09/2026 — PARTE 1 di 2
--
-- Colonna nuova "Richiesto intervento operatore": APR ci parcheggia le pratiche
-- su cui serve una decisione umana, senza far partire nulla al cliente.
--
-- Va eseguita DA SOLA: Postgres non permette di usare un valore di enum nella
-- stessa transazione in cui lo si aggiunge.
-- ============================================================
ALTER TYPE public.stage_type ADD VALUE IF NOT EXISTS 'intervento_operatore';
