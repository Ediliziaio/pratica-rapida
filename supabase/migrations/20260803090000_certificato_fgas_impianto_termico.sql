-- Modulo "ENEA — Impianto termico / Pompa di calore": al cliente privato
-- si chiede il certificato F-GAS, non un altro documento.
--
-- Cambiano SOLO i testi mostrati (titolo dello step, etichetta e testo di
-- aiuto del campo). La chiave del campo resta `libretto_url`: e
-- l'identificativo con cui sono gia archiviati i file delle pratiche
-- esistenti, e rinominarla li scollegherebbe.
--
-- La sostituzione lavora sul testo del jsonb ed e scritta per essere
-- rieseguibile: se i testi sono gia aggiornati non trova nulla da
-- cambiare e la riga resta com'e.

update public.form_modules
set schema = replace(
      replace(
        replace(
          schema::text,
          '"Libretto impianto nuovo"',
          '"Certificato F-GAS"'
        ),
        '"Carica il libretto dell''impianto installato"',
        '"Carica il certificato F-GAS"'
      ),
      '"Il libretto deve riportare marca e modello dell''impianto installato"',
      '"Il certificato F-GAS deve riportare marca e modello dell''impianto installato"'
    )::jsonb,
    updated_at = now()
where slug = 'enea-impianto-termico'
  and schema::text like '%libretto dell%';
