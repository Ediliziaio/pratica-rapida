/**
 * Dove si ferma il cliente privato che arriva dall'annuncio.
 *
 * Dal 19/10/2026 Pratica Rapida ha un annuncio su Google che porta il
 * privato su /area-riservata-vecchia/pratica-enea. Il percorso d'acquisto
 * funziona e non si tocca: qui si segnano soltanto i passaggi, per sapere
 * DOVE si perde la gente prima di cambiare qualunque cosa.
 *
 * Si misura un imbuto, non si segue una persona: un numero a caso che dura
 * quanto la scheda del browser, il nome del passo, l'ora. Nessun nome,
 * nessun indirizzo, niente che permetta di risalire a qualcuno.
 */
const BASE = import.meta.env.VITE_SUPABASE_URL ?? "";
const CHIAVE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export type PassoPrivato =
  // sulla pagina della richiesta
  | "aperto"
  | "privato"
  | "prodotto"
  | "nome"
  | "telefono"
  | "email"
  | "invia"
  | "registrata"
  // sul modulo /form/:token che segue
  | "modulo"
  | "compila"
  | "ultima"
  | "invio"
  | "pagamento"
  | "pagato";

const CHIAVE_VISITA = "pr-imbuto-visita";
const CHIAVE_PRIVATO = "pr-imbuto-privato";

function leggi(chiave: string): string | null {
  try {
    return sessionStorage.getItem(chiave);
  } catch {
    return null;
  }
}

function scrivi(chiave: string, valore: string): void {
  try {
    sessionStorage.setItem(chiave, valore);
  } catch {
    /* finestra anonima o archiviazione bloccata: si misura lo stesso */
  }
}

/**
 * Un numero a caso che dura quanto la scheda del browser. Sopravvive al
 * passaggio dalla pagina della richiesta al modulo e al ritorno da Stripe,
 * che avvengono nella stessa scheda; non riconosce chi torna un altro giorno.
 */
function visita(): string {
  const gia = leggi(CHIAVE_VISITA);
  if (gia) return gia;
  const nuova = crypto.randomUUID();
  scrivi(CHIAVE_VISITA, nuova);
  return nuova;
}

/** Quelli gia' segnati in questa pagina: contarli due volte falserebbe tutto. */
const fatti = new Set<PassoPrivato>();

/**
 * Segna un passo. Non aspetta e non si lamenta: la misura non deve mai
 * rallentare o rompere la pagina di chi sta comprando.
 */
export function segnaPrivato(passo: PassoPrivato): void {
  if (!BASE || fatti.has(passo)) return;
  fatti.add(passo);
  if (passo === "privato") scrivi(CHIAVE_PRIVATO, "1");
  try {
    void fetch(`${BASE}/functions/v1/praticarapida-passi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CHIAVE ? { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` } : {}),
      },
      body: JSON.stringify({ visita: visita(), passo }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* meglio perdere una misura che una vendita */
  }
}

/**
 * Il modulo /form/:token lo aprono anche i clienti dei rivenditori, dal link
 * su WhatsApp. Si conta soltanto chi ci arriva, nella stessa scheda, dalla
 * scelta «Sono un cliente privato».
 */
export function eUnPrivatoDalSito(): boolean {
  return leggi(CHIAVE_PRIVATO) === "1";
}
