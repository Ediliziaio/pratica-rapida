/**
 * La conversazione, dal lato di chi scrive.
 *
 * Il browser non tocca mai le tabelle: parla con la funzione `chat-cliente`,
 * che conosce la chiave e tira fuori soltanto la conversazione di chi la
 * possiede.
 *
 * La chiave sta in `localStorage` e non in `sessionStorage` di proposito:
 * chi scrive alle undici di sera e torna il mattino dopo deve ritrovare la
 * risposta dove l'ha chiesta. Se la perdesse chiudendo il browser, avremmo
 * ricostruito per la seconda volta il problema che stiamo risolvendo.
 */
const BASE = import.meta.env.VITE_SUPABASE_URL ?? "";
const CHIAVE_LOCALE = "eneasubito-conversazione";

export interface MessaggioChat {
  id: string;
  da: "cliente" | "operatore" | "automatico";
  testo: string;
  created_at: string;
}

async function chiama(corpo: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!BASE) return null;
  try {
    const risposta = await fetch(`${BASE}/functions/v1/chat-cliente`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const d = await risposta.json().catch(() => null);
    return risposta.ok ? d : null;
  } catch {
    return null;
  }
}

export function chiaveSalvata(): string | null {
  try {
    return localStorage.getItem(CHIAVE_LOCALE);
  } catch {
    return null;
  }
}

function ricorda(chiave: string) {
  try {
    localStorage.setItem(CHIAVE_LOCALE, chiave);
  } catch {
    /* navigazione privata: la conversazione vive finche' la pagina resta aperta */
  }
}

/**
 * Il codice della pratica che questa persona sta compilando, se ne ha una.
 *
 * Non e' un dato nuovo che le chiediamo: e' quello che ci ha gia' dato nel
 * modulo. Serve a non far leggere all'operatore «visitatore senza
 * indirizzo» mentre il nome ce l'ha sotto il naso.
 */
function praticaInCorso(): string | undefined {
  try {
    return sessionStorage.getItem("eneasubito-token") ?? undefined;
  } catch {
    return undefined;
  }
}

/** Apre una conversazione nuova e restituisce la chiave. */
export async function apri(pagina: string): Promise<string | null> {
  const d = await chiama({
    azione: "apri",
    marchio: "eneasubito",
    pagina,
    pratica: praticaInCorso(),
  });
  const chiave = typeof d?.chiave === "string" ? d.chiave : null;
  if (chiave) ricorda(chiave);
  return chiave;
}

export async function scrivi(
  chiave: string,
  testo: string,
  email?: string,
  pagina?: string,
): Promise<boolean> {
  const d = await chiama({ azione: "scrivi", chiave, testo, email, pagina });
  return !!d?.ok;
}

export async function leggi(
  chiave: string,
): Promise<{ messaggi: MessaggioChat[]; chiusa: boolean } | null> {
  const d = await chiama({ azione: "leggi", chiave });
  if (!d?.ok) return null;
  return {
    messaggi: (d.messaggi ?? []) as MessaggioChat[],
    chiusa: !!d.chiusa,
  };
}
