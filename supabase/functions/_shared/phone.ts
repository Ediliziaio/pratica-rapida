/**
 * Normalizzazione numero telefonico per Meta WhatsApp Cloud API.
 *
 * Meta accetta E.164 SENZA `+` (es. `393483467567`). Se il numero non ha
 * il country code, Meta lo parsa "alla sua maniera" (es. `3483467567`
 * → paese `34` = Spagna → numero spagnolo invalido) e risponde con
 * errore generico, spesso `#200 You do not have the necessary permissions
 * to send messages on behalf of this WhatsApp Business Account` invece
 * del più chiaro `#131009 Invalid recipient`. Causa di ore di debug
 * sprecato perché #200 sembra un problema di config Meta mentre è in
 * realtà un bug client-side.
 *
 * Regole:
 * - Tiene solo cifre (rimuove spazi, trattini, parentesi, `+`)
 * - Converte prefisso internazionale `00` → niente, `0039` → `39`
 * - Se mancano cifre (≤ 10) assume numero italiano e prepende `39`
 * - Lascia invariati numeri già E.164-like (≥ 11 cifre con prefisso noto)
 *
 * Pratica Rapida è Italy-only quindi default `+39` è safe.
 *
 * Esempi:
 *   "3483467567"      → "393483467567"  ← bug fix: era "3483467567"
 *   "+39 348 346 7567" → "393483467567"
 *   "0039 348 3467567" → "393483467567"
 *   "393483467567"    → "393483467567"  (no-op)
 *   "00393483467567"  → "393483467567"
 */
export function normalizePhone(phone: string): string {
  // 1) digit-only
  let digits = phone.replace(/\D/g, "");

  // 2) prefisso internazionale "00..." → senza zeri iniziali
  if (digits.startsWith("0039")) {
    digits = "39" + digits.slice(4);
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // 3) se inizia con 0 (Italian fixed-line con prefisso locale) → rimuovi
  //    SOLO se il numero senza lo zero è plausibile-italiano (8-10 cifre)
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 11) {
    digits = digits.slice(1);
  }

  // 4) prepend country code italiano se assente
  //    Italian mobile: 10 digits starting with 3 (es. 348...)
  //    Italian landline post-zero-strip: 8-10 digits
  //    Heuristic: digits che non iniziano con `39` E hanno lunghezza 8-10
  //    sono italiani senza prefisso → prepend `39`.
  if (digits.length >= 8 && digits.length <= 10 && !digits.startsWith("39")) {
    digits = "39" + digits;
  }

  return digits;
}
