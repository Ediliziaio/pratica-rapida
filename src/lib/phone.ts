/**
 * Normalizzazione numero telefonico per Meta WhatsApp Cloud API.
 *
 * GEMELLO di `supabase/functions/_shared/phone.ts` (server). Le due copie
 * DEVONO restare allineate — se cambi una, cambia anche l'altra. Sono
 * separate perché il bundle Vite del browser non può importare codice Deno
 * server-side.
 *
 * Meta accetta E.164 SENZA `+` (es. `393483467567`). Senza country code
 * Meta parsa "alla sua maniera" (es. `3483467567` → paese `34` = Spagna →
 * numero spagnolo invalido) e risponde `#200 You do not have the
 * necessary permissions to send messages on behalf of this WhatsApp
 * Business Account` invece del più chiaro `#131009 Invalid recipient`.
 * Pratica Rapida è Italy-only quindi default `+39` è safe.
 */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");

  if (digits.startsWith("0039")) {
    digits = "39" + digits.slice(4);
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 11) {
    digits = digits.slice(1);
  }

  if (digits.length >= 8 && digits.length <= 10 && !digits.startsWith("39")) {
    digits = "39" + digits;
  }

  return digits;
}
