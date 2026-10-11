-- Il prezzo di EneaSubito, in banca dati e non nel codice.
--
-- Sta qui per due motivi: non deve poter arrivare dal browser (il prezzo di
-- una pratica non dipende da cosa ha in pancia la pagina), e cambiarlo deve
-- essere un campo, non una pubblicazione. Se un giorno si prova a 60 € o a
-- 129 €, si cambia questo valore e basta.
--
-- Chiave separata da `prezzo_privato_enea`, che e' dell'altra societa' e
-- dell'altra catena di incasso: le due non si devono incrociare.

INSERT INTO public.platform_settings (key, value)
VALUES (
  'prezzo_eneasubito',
  jsonb_build_object(
    'importo_cents', 9900,
    'valuta', 'eur',
    'attivo', true
  )
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.platform_settings IS
  'Impostazioni di piattaforma. prezzo_eneasubito: importo in centesimi del secondo marchio, letto dalla funzione di incasso e mai dal browser.';
