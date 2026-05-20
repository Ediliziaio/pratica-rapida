/**
 * Utility di validazione per il form pubblico ENEA.
 *
 * Contiene la validazione del codice fiscale italiano (check digit secondo
 * l'algoritmo del Ministero delle Finanze) e helper date per evitare valori
 * impossibili (anno futuro per costruzione, data nascita nel futuro, ecc.).
 */

// ============================================================
// Codice fiscale italiano — algoritmo check digit
// ============================================================

const CF_ODD_VALUES: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9,
  "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
  U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

const CF_EVEN_VALUES: Record<string, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4,
  "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9,
  K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19,
  U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};

const CF_CHECK_LETTER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Valida il codice fiscale italiano (16 caratteri) verificando anche il
 * check digit finale secondo l'algoritmo ufficiale.
 *
 * Rispetto al regex base (che controlla solo il pattern formale), questa
 * funzione rileva CF generati casualmente che hanno la struttura giusta
 * ma carattere di controllo sbagliato.
 *
 * Edge cases gestiti:
 * - case-insensitive: "rsslcu80a01h501n" → uppercase prima del check
 * - spazi e caratteri non-alfanumerici: ignorati
 * - lunghezza diversa da 16: ritorna false subito (no eccezioni)
 */
export function isValidCodiceFiscale(cf: string): boolean {
  if (!cf || typeof cf !== "string") return false;
  const clean = cf.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{16}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = clean[i];
    // I caratteri in posizione DISPARI (1-based) usano CF_ODD_VALUES.
    // In 0-based: i=0 è "primo" → dispari, i=1 è "secondo" → pari, ecc.
    const isOddPosition = (i % 2) === 0;
    const value = isOddPosition ? CF_ODD_VALUES[ch] : CF_EVEN_VALUES[ch];
    if (value === undefined) return false;
    sum += value;
  }
  const expectedCheck = CF_CHECK_LETTER[sum % 26];
  return expectedCheck === clean[15];
}

// ============================================================
// Validazione anno di costruzione
// ============================================================

/**
 * Controlla se l'anno di costruzione è in un range plausibile (no anni
 * futuri, no anni medievali). Default min 1800 (edifici storici).
 */
export function isValidAnnoCostruzione(value: string | number): boolean {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return false;
  const currentYear = new Date().getFullYear();
  return n >= 1800 && n <= currentYear;
}

// ============================================================
// Validazione data di nascita
// ============================================================

/**
 * Controlla che la data di nascita sia:
 *  - una data valida (no "31/02/2020")
 *  - nel passato (no date future)
 *  - non oltre 130 anni fa (no date assurde)
 */
export function isValidDataNascita(value: string): boolean {
  if (!value) return false;
  // Accetta formato ISO (yyyy-mm-dd) o italiano (dd/mm/yyyy)
  let date: Date;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    date = new Date(value);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [d, m, y] = value.split("/").map(Number);
    date = new Date(y, m - 1, d);
    // Verifica che la data sia "esatta" (Date corregge silenziosamente:
    // new Date(2020, 1, 31) diventa 2 marzo invece di rifiutare).
    if (date.getDate() !== d || date.getMonth() !== m - 1 || date.getFullYear() !== y) {
      return false;
    }
  } else {
    return false;
  }
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  if (date > now) return false; // futuro
  const minYear = now.getFullYear() - 130;
  if (date.getFullYear() < minYear) return false;
  return true;
}

// ============================================================
// Validazione numeri positivi (per superficie_mq, numero_appartamenti)
// ============================================================

/**
 * Controlla che la stringa rappresenti un numero positivo > 0.
 * Rifiuta negativi, zero, NaN, stringhe non-numeriche.
 */
export function isPositiveNumber(value: string | number): boolean {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) && n > 0;
}

/**
 * Controlla che la stringa rappresenti un intero positivo > 0.
 * Usato per numero_appartamenti (deve essere intero).
 */
export function isPositiveInteger(value: string | number): boolean {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isInteger(n) && n > 0;
}
