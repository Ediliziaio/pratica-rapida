
ALTER TABLE public.clienti_finali
ADD COLUMN IF NOT EXISTS codice_destinatario_sdi text DEFAULT '',
ADD COLUMN IF NOT EXISTS referente text DEFAULT '',
ADD COLUMN IF NOT EXISTS paese text DEFAULT 'Italia',
ADD COLUMN IF NOT EXISTS note_indirizzo text DEFAULT '',
ADD COLUMN IF NOT EXISTS codice_cliente_interno text DEFAULT '',
ADD COLUMN IF NOT EXISTS pec text DEFAULT '',
ADD COLUMN IF NOT EXISTS invio_documento_cortesia boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS escludi_documento_cortesia boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS escludi_solleciti boolean DEFAULT false;
