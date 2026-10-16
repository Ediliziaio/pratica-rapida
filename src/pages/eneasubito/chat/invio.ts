/**
 * Il messaggio della chat che arriva al server.
 *
 * Due regole, le stesse del resto del marchio:
 *
 *  1. **Non si perde chi scrive.** Se l'invio fallisce la chat lo dice in
 *     chiaro e offre l'indirizzo e-mail: mai un pulsante che non fa niente.
 *  2. **Si manda solo quello che serve** — il testo, l'indirizzo per
 *     rispondere, e la pagina da cui scriveva. Niente altro: chi apre una
 *     chat per fare una domanda non si aspetta di lasciare una scia.
 */

const BASE = import.meta.env.VITE_SUPABASE_URL ?? "";
const CHIAVE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export interface Messaggio {
  testo: string;
  email: string;
  /** Solo il percorso, mai l'indirizzo intero con i parametri. */
  pagina: string;
}

export async function mandaMessaggio(m: Messaggio): Promise<boolean> {
  if (!BASE) return false;
  try {
    const risposta = await fetch(`${BASE}/functions/v1/eneasubito-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CHIAVE ? { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` } : {}),
      },
      // `website` e' la trappola per i programmi automatici: un umano non la
      // compila mai, e il server scarta in silenzio quello che la porta.
      body: JSON.stringify({ ...m, website: "" }),
    });
    return risposta.ok;
  } catch {
    // Rete assente, server giu', bloccante del browser: non importa quale.
    return false;
  }
}
