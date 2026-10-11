/**
 * Il collegamento fra il modulo gratuito e la pratica sul server.
 *
 * Due regole, e sono entrambe deliberate:
 *
 *  1. **Non blocca mai il cliente.** Se il server non risponde, la verifica
 *     va avanti lo stesso e l'esito glielo diamo uguale: la nostra
 *     contabilita' non e' un suo problema. Al massimo perdiamo la bozza.
 *  2. **L'indirizzo sta in un posto solo.** Quando il database avra' un
 *     dominio proprio (api.eneasubito.it), si cambia questa costante e basta:
 *     e' l'unico punto in cui il sito nomina il server.
 */

const BASE = import.meta.env.VITE_SUPABASE_URL ?? "";
const CHIAVE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const ENDPOINT = `${BASE}/functions/v1/eneasubito-verifica`;

export interface DatiPratica {
  token?: string | null;
  email?: string;
  famiglia?: string | null;
  fineLavori?: string;
  esito?: "si_puo_fare" | "non_si_puo_fare" | "serve_un_controllo";
  motivi?: string[];
}

/**
 * Crea la pratica o aggiorna quella che esiste. Ritorna il token da
 * conservare, oppure `null` se non si e' potuto salvare — e in quel caso
 * chi chiama tira dritto.
 */
export async function salvaPratica(dati: DatiPratica): Promise<string | null> {
  if (!BASE) return null;
  try {
    const risposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CHIAVE ? { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` } : {}),
      },
      body: JSON.stringify({ ...dati, website: "" }),
    });
    if (!risposta.ok) return null;
    const esito = (await risposta.json()) as { token?: string | null };
    return esito.token ?? null;
  } catch {
    // Rete assente, server giu', bloccante del browser: non importa quale.
    // Il modulo deve funzionare lo stesso.
    return null;
  }
}

/**
 * Apre il pagamento e restituisce l'indirizzo a cui mandare il cliente.
 *
 * `null` quando il conto di incasso non e' ancora collegato o qualcosa non
 * va: in quel caso chi chiama lo dice in chiaro invece di lasciare un
 * pulsante che non fa niente.
 */
export async function apriPagamento(token: string): Promise<string | null> {
  if (!BASE || !token) return null;
  try {
    const risposta = await fetch(`${BASE}/functions/v1/eneasubito-pagamento`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CHIAVE ? { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` } : {}),
      },
      body: JSON.stringify({ token }),
    });
    if (!risposta.ok) return null;
    const esito = (await risposta.json()) as { url?: string };
    return esito.url ?? null;
  } catch {
    return null;
  }
}
