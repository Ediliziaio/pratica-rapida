/**
 * Dove si ferma chi apre il modulo.
 *
 * Al 17/10/2026 sedici persone sono atterrate sul modulo arrivando
 * dall'annuncio e nessuna ha lasciato il nome. Senza sapere *dove* si
 * fermano, qualunque modifica alla pagina e' un tiro al buio: si cambia il
 * titolo quando il problema era il pulsante, o il prezzo quando il problema
 * era la domanda sul nome in fattura.
 *
 * Quindi si segnano i passi, e si segnano **solo** quelli: una visita
 * anonima, il nome del passo, l'ora. Nessun nome, nessun indirizzo, niente
 * che permetta di risalire a una persona — qui si misura un imbuto, non si
 * segue qualcuno.
 */
const BASE = import.meta.env.VITE_SUPABASE_URL ?? "";
const CHIAVE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

/** I passi che vogliamo contare, in ordine. */
export type Passo =
  | "aperto"
  | "lavoro"
  | "nome"
  | "email"
  | "continua"
  | "passo2"
  | "fattura"
  | "pagamento";

const CHIAVE_VISITA = "eneasubito-visita";

/**
 * Un numero a caso che dura quanto la scheda del browser.
 *
 * Non e' un identificativo della persona: non la segue da un giorno
 * all'altro, non la riconosce se torna, e non lo sappiamo collegare a nome o
 * indirizzo. Serve solo a capire che «aperto» e «continua» vengono dalla
 * stessa visita, altrimenti non si potrebbe misurare niente.
 */
function visita(): string {
  try {
    const gia = sessionStorage.getItem(CHIAVE_VISITA);
    if (gia) return gia;
    const nuova = crypto.randomUUID();
    sessionStorage.setItem(CHIAVE_VISITA, nuova);
    return nuova;
  } catch {
    // Finestra anonima o archiviazione bloccata: si misura lo stesso, e quella
    // visita contera' come una a se' stante.
    return crypto.randomUUID();
  }
}

/** Quelli gia' segnati in questa visita: contarli due volte falserebbe tutto. */
const fatti = new Set<Passo>();

/**
 * Segna un passo. Non aspetta e non si lamenta: la misura non deve mai
 * rallentare o rompere la pagina di chi sta comprando.
 */
export function segna(passo: Passo): void {
  if (!BASE || fatti.has(passo)) return;
  fatti.add(passo);
  try {
    void fetch(`${BASE}/functions/v1/eneasubito-passi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CHIAVE ? { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` } : {}),
      },
      body: JSON.stringify({ visita: visita(), passo }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* non succede niente: meglio perdere una misura che una vendita */
  }
}
