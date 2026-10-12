/**
 * Il collegamento fra il modulo e la pratica sul server.
 *
 * Tre regole, e sono deliberate:
 *
 *  1. **Non si perde il cliente.** Se la fattura non si riesce a caricare, si
 *     va alla cassa lo stesso: l'indirizzo ce l'abbiamo e il documento si
 *     richiede dopo. L'unica cosa che puo' fermare la corsa e' non riuscire a
 *     creare la pratica, perche' senza quella non c'e' niente da pagare.
 *  2. **L'indirizzo sta in un posto solo.** Quando il database avra' un
 *     dominio proprio (api.eneasubito.it), si cambia questa costante e basta:
 *     e' l'unico punto in cui il sito nomina il server.
 *  3. **Il prezzo non passa di qui.** Lo decide il server leggendolo dalle
 *     impostazioni: quello che ha in pancia il browser non conta.
 */
import { createClient } from "@supabase/supabase-js";

const BASE = import.meta.env.VITE_SUPABASE_URL ?? "";
const CHIAVE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const ENDPOINT = `${BASE}/functions/v1/eneasubito-verifica`;

const intestazioni = () => ({
  "Content-Type": "application/json",
  ...(CHIAVE ? { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` } : {}),
});

export interface DatiPratica {
  token?: string | null;
  nome?: string;
  email?: string;
  famiglia?: string | null;
  /** Dove e' finita la fattura dentro lo storage, una volta caricata. */
  fatturaPath?: string;
}

/**
 * Crea la pratica o aggiorna quella che esiste. Ritorna il token da
 * conservare, oppure `null` se non si e' potuto salvare.
 */
export async function salvaPratica(dati: DatiPratica): Promise<string | null> {
  if (!BASE) return null;
  try {
    const risposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: intestazioni(),
      body: JSON.stringify({ ...dati, website: "" }),
    });
    if (!risposta.ok) return null;
    const esito = (await risposta.json()) as { token?: string | null };
    return esito.token ?? null;
  } catch {
    // Rete assente, server giu', bloccante del browser: non importa quale.
    return null;
  }
}

/**
 * Carica la fattura e la appende alla pratica. Ritorna `true` se e' arrivata.
 *
 * Usa la stessa strada del modulo pubblico di Pratica Rapida: la funzione
 * `form-upload` controlla il token e restituisce un permesso di scrittura
 * valido per un solo file, poi il file va dritto allo storage senza passare
 * per un JSON. E' gia' in produzione tutti i giorni, non c'e' motivo di
 * inventarne un'altra.
 */
export async function caricaFattura(token: string, file: File): Promise<boolean> {
  if (!BASE || !CHIAVE || !token) return false;
  try {
    const db = createClient(BASE, CHIAVE);
    const { data, error } = await db.functions.invoke("form-upload", {
      body: {
        action: "create_signed_upload",
        token,
        kind: "fattura",
        filename: file.name,
        size: file.size,
        content_type: file.type || "application/octet-stream",
      },
    });
    if (error) return false;
    const permesso = data as { success?: boolean; path?: string; upload_token?: string };
    if (!permesso?.success || !permesso.path || !permesso.upload_token) return false;

    const { error: erroreCaricamento } = await db.storage
      .from("enea-documents")
      .uploadToSignedUrl(permesso.path, permesso.upload_token, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (erroreCaricamento) return false;

    // Il file esiste ma non e' ancora di nessuno: e' questa chiamata che lo
    // attacca alla pratica, ed e' il server a scriverlo.
    const salvato = await salvaPratica({ token, fatturaPath: permesso.path });
    return salvato !== null;
  } catch {
    return false;
  }
}

/**
 * Apre il pagamento. Torna l'indirizzo a cui mandare il cliente, oppure il
 * motivo per cui non si e' aperto.
 *
 * Il motivo lo dice il server e arriva fino alla pagina: «risulta gia'
 * pagata» e «il conto di incasso non e' collegato» sono due guasti diversi e
 * si risolvono in modo diverso. Schiacciarli in un'unica frase generica
 * costa un pomeriggio di indagini, ed e' gia' successo.
 */
export type EsitoPagamento = { url: string } | { errore: string };

export async function apriPagamento(token: string): Promise<EsitoPagamento> {
  if (!BASE || !token) return { errore: "Il collegamento al pagamento non e' configurato." };
  try {
    const risposta = await fetch(`${BASE}/functions/v1/eneasubito-pagamento`, {
      method: "POST",
      headers: intestazioni(),
      body: JSON.stringify({ token }),
    });
    const esito = (await risposta.json().catch(() => ({}))) as { url?: string; error?: string };
    if (esito.url) return { url: esito.url };
    return { errore: esito.error ?? `Il pagamento ha risposto ${risposta.status}.` };
  } catch {
    return { errore: "Non siamo riusciti a raggiungere il pagamento." };
  }
}
