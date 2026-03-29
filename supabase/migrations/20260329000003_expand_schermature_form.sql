-- Expand client_form_schermature with all fields from the original form

ALTER TABLE client_form_schermature
  -- Dati personali completi
  ADD COLUMN IF NOT EXISTS data_nascita DATE,
  ADD COLUMN IF NOT EXISTS comune_nascita TEXT,
  ADD COLUMN IF NOT EXISTS provincia_nascita TEXT,
  ADD COLUMN IF NOT EXISTS codice_fiscale TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS telefono TEXT,

  -- Cointestatario
  ADD COLUMN IF NOT EXISTS cointestatario_nome TEXT,
  ADD COLUMN IF NOT EXISTS cointestatario_cognome TEXT,
  ADD COLUMN IF NOT EXISTS cointestatario_cf TEXT,

  -- Residenza
  ADD COLUMN IF NOT EXISTS comune_residenza TEXT,
  ADD COLUMN IF NOT EXISTS provincia_residenza TEXT,
  ADD COLUMN IF NOT EXISTS indirizzo_residenza TEXT,
  ADD COLUMN IF NOT EXISTS civico_residenza TEXT,
  ADD COLUMN IF NOT EXISTS cap_residenza TEXT,

  -- Appartamento (dove sono stati effettuati i lavori)
  ADD COLUMN IF NOT EXISTS comune_appartamento TEXT,
  ADD COLUMN IF NOT EXISTS provincia_appartamento TEXT,
  ADD COLUMN IF NOT EXISTS indirizzo_appartamento TEXT,
  ADD COLUMN IF NOT EXISTS civico_appartamento TEXT,
  ADD COLUMN IF NOT EXISTS cap_appartamento TEXT,

  -- Dati catastali
  ADD COLUMN IF NOT EXISTS catasto_foglio TEXT,
  ADD COLUMN IF NOT EXISTS catasto_mappale TEXT,
  ADD COLUMN IF NOT EXISTS catasto_subalterno TEXT,
  ADD COLUMN IF NOT EXISTS tipo_conduzione TEXT,

  -- Impianto termico esistente
  ADD COLUMN IF NOT EXISTS impianto_tipo TEXT,
  ADD COLUMN IF NOT EXISTS impianto_combustibile TEXT,
  ADD COLUMN IF NOT EXISTS impianto_tipo_caldaia TEXT,
  ADD COLUMN IF NOT EXISTS impianto_condizionamento TEXT,

  -- Dati schermatura (dettagli prodotto)
  ADD COLUMN IF NOT EXISTS produttore TEXT,
  ADD COLUMN IF NOT EXISTS orientamento TEXT,
  ADD COLUMN IF NOT EXISTS numero_unita INTEGER,
  ADD COLUMN IF NOT EXISTS motorizzato BOOLEAN,

  -- Fattura
  ADD COLUMN IF NOT EXISTS costo_totale_iva NUMERIC;
