-- enea_practices.invia_pratica_al_cliente
--
-- Con "Documenti Forniti" il cliente finale non viene MAI contattato: il
-- rivenditore raccoglie tutto lui e i guard in on-stage-changed /
-- process-automations bloccano ogni messaggio al privato.
--
-- Restava però scoperto un caso legittimo: il rivenditore vuole che la pratica
-- ENEA conclusa arrivi comunque al suo cliente, come succede con "Servizio
-- Completo". Ora glielo chiediamo nel form ("Vuoi che mandiamo la pratica ENEA
-- al cliente una volta conclusa?") e la risposta finisce qui.
--
-- true  → allo stage "Invio pratica chiusa" (da_inviare) il cliente riceve
--         email con la pratica allegata + WhatsApp, esattamente come nel
--         servizio completo.
-- false → nessun contatto, comportamento storico. È il default: se nessuno ha
--         risposto (pratiche già a sistema, form vecchi), non si scrive a
--         nessuno.
--
-- Non serve esporla in enea_practices_public: la scrive il form (insert diretto
-- sulla tabella) e la legge on-stage-changed col service role. Tenerla fuori
-- dalla view evita di doverla difendere a ogni ridefinizione.
ALTER TABLE public.enea_practices
  ADD COLUMN IF NOT EXISTS invia_pratica_al_cliente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.enea_practices.invia_pratica_al_cliente IS
  'Solo per tipo_servizio=documenti_forniti: se true, allo stage da_inviare la pratica conclusa viene inviata anche al cliente finale (email + WhatsApp). Default false = cliente mai contattato.';
