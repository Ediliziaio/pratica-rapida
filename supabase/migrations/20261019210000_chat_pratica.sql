-- Chi sta scrivendo nella chat, quando lo sappiamo gia'.
--
-- L'indirizzo nella chat e' facoltativo — la risposta arriva nella finestra,
-- non per mail — e il risultato e' che l'operatore legge «visitatore senza
-- indirizzo» e non sa con chi parla. Ma la maggior parte di chi scrive sta
-- compilando il modulo in quel momento, e di quella persona nome e indirizzo
-- li abbiamo gia': basta legare la conversazione alla pratica che ha aperto
-- nello stesso browser.
--
-- Non si chiede niente in piu' a nessuno: si usa quello che la persona ci ha
-- gia' dato.
ALTER TABLE public.chat_conversazioni
  ADD COLUMN IF NOT EXISTS pratica_id uuid
    REFERENCES public.enea_practices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.chat_conversazioni.pratica_id IS
  'La pratica che la persona stava compilando quando ha scritto, se ne aveva una.';
