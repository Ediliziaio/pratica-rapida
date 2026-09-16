// CRM ombra — nucleo del blocco delle comunicazioni in uscita.
//
// TypeScript puro, zero Deno, zero dipendenze: così è testabile da vitest
// (src/features/enea-shadow-crm/ombra/*.test.ts) e importabile dalle edge
// function tramite ./ombra.ts. Nel progetto Supabase "ombra" è impostato il
// secret CRM_OMBRA=true; in produzione non esiste e tutto questo è inerte.
//
// Tre serrature, indipendenti:
//   1. le chiavi Resend / WhatsApp / ElevenLabs NON esistono nel progetto ombra
//      (regola del titolare: se mancano, nulla può partire per costruzione);
//   2. ogni funzione che spedisce chiama bloccaSeOmbra() prima di qualsiasi
//      fetch verso l'esterno e, in ombra, scrive nella tabella e ritorna;
//   3. in ombra, fetch verso qualsiasi host diverso da Supabase lancia
//      un'eccezione (guardia installata da ./ombra.ts).

export const CRM_OMBRA_ENV = "CRM_OMBRA" as const;
export const TABELLA_COMUNICAZIONI_BLOCCATE = "comunicazioni_bloccate" as const;

export const FUNZIONI_BLOCCATE = ["send-email", "send-whatsapp", "notify-cliente", "elevenlabs-call", "send-reminders"] as const;
export type FunzioneBloccata = typeof FUNZIONI_BLOCCATE[number];
export type CanaleBloccato = "email" | "whatsapp" | "chiamata" | "notifica_cliente" | "reminder";

export interface RigaComunicazioneBloccata {
  funzione: FunzioneBloccata;
  canale: CanaleBloccato;
  destinatario: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export type LeggiEnv = (key: string) => string | undefined;

export function isOmbra(env: LeggiEnv): boolean {
  return env(CRM_OMBRA_ENV) === "true";
}

// Il destinatario, se il payload lo porta in una forma riconoscibile.
export function destinatarioDa(payload: Record<string, unknown>): string | null {
  const to = payload.to;
  if (typeof to === "string" && to.trim()) return to.trim();
  if (Array.isArray(to) && to.length) return to.filter((item) => typeof item === "string").join(", ") || null;
  for (const key of ["practice_id", "token_id"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return `${key}:${value.trim()}`;
  }
  return null;
}

// Il payload va in tabella così com'è, meno gli allegati (pesano e non servono
// a capire cosa sarebbe partito): al loro posto resta il nome del file.
export function rigaBloccata(funzione: FunzioneBloccata, canale: CanaleBloccato, payload: Record<string, unknown>, now: Date): RigaComunicazioneBloccata {
  const copia: Record<string, unknown> = { ...payload };
  if (Array.isArray(copia.attachments)) {
    copia.attachments = copia.attachments.map((item) => (item && typeof item === "object" && "filename" in item ? { filename: (item as { filename: unknown }).filename } : "allegato"));
  }
  return { funzione, canale, destinatario: destinatarioDa(payload), payload: copia, created_at: now.toISOString() };
}

export function corpoRispostaBloccata(funzione: FunzioneBloccata, canale: CanaleBloccato) {
  return { success: true, ombra: true, blocked: true, funzione, canale, message: "CRM ombra: comunicazione registrata in comunicazioni_bloccate, non inviata." };
}

export const ERRORE_FETCH_BLOCCATA = "crm_ombra_fetch_bloccata" as const;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

// In ombra l'unico host raggiungibile è quello di Supabase (database, storage,
// altre funzioni). Tutto il resto — api.resend.com, graph.facebook.com,
// api.elevenlabs.io, qualsiasi cosa — lancia prima di uscire.
export function installaGuardiaFetch(target: { fetch: FetchLike }, hostConsentiti: ReadonlyArray<string>): () => void {
  const originale = target.fetch;
  const consentiti = new Set(hostConsentiti.map((host) => host.toLowerCase()));
  target.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let host = "";
    try { host = new URL(url).host.toLowerCase(); } catch { host = ""; }
    if (!consentiti.has(host)) return Promise.reject(new Error(`${ERRORE_FETCH_BLOCCATA}:${host || "url-non-valida"}`));
    return originale(input, init);
  };
  return () => { target.fetch = originale; };
}
