// CRM ombra — lato Deno del blocco comunicazioni. Vedi ./ombraCore.ts per la
// logica (pura e testata). Le cinque funzioni in uscita importano da qui.
import {
  TABELLA_COMUNICAZIONI_BLOCCATE,
  corpoRispostaBloccata,
  installaGuardiaFetch,
  isOmbra,
  rigaBloccata,
  type CanaleBloccato,
  type FunzioneBloccata,
} from "./ombraCore.ts";

// Deno letto da globalThis: il modulo è importato anche dai test vitest in Node,
// dove Deno non esiste come tipo (i test lo simulano).
const denoEnv = (key: string): string | undefined => (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno?.env.get(key);

export const OMBRA: boolean = isOmbra(denoEnv);

// Serratura 3: in ombra il fetch globale esce solo verso Supabase. Installata
// al primo import, cioè prima che qualsiasi handler venga eseguito.
if (OMBRA) {
  const supabaseHost = (() => { try { return new URL(denoEnv("SUPABASE_URL") ?? "").host; } catch { return ""; } })();
  installaGuardiaFetch(globalThis as unknown as { fetch: typeof fetch }, supabaseHost ? [supabaseHost] : []);
  console.warn("[crm-ombra] modalità OMBRA attiva: nessuna comunicazione esce, fetch limitato a", supabaseHost || "(nessun host)");
}

type InsertClient = { from: (table: string) => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> } };

// Serratura 2: da chiamare subito dopo aver letto il payload, prima di ogni
// invio. Fuori dall'ombra ritorna null e la funzione prosegue come sempre.
export async function bloccaSeOmbra(
  supabase: InsertClient,
  funzione: FunzioneBloccata,
  canale: CanaleBloccato,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<Response | null> {
  if (!OMBRA) return null;
  const riga: Record<string, unknown> = { ...rigaBloccata(funzione, canale, payload, new Date()) };
  const { error } = await supabase.from(TABELLA_COMUNICAZIONI_BLOCCATE).insert(riga);
  if (error) {
    // Anche se la registrazione fallisce, la comunicazione NON parte: si risponde
    // con errore, mai con un invio.
    console.error(`[crm-ombra] registrazione fallita per ${funzione}: ${error.message}`);
    return new Response(JSON.stringify({ success: false, ombra: true, blocked: true, error: `comunicazione bloccata ma non registrata: ${error.message}` }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(corpoRispostaBloccata(funzione, canale)), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
