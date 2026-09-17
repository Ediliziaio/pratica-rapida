// Formato del file con cui una pratica passa dal CRM vero al CRM ombra.
//
// Un solo file JSON, senza librerie: `pratica-ombra-<id>-<data>.json`.
// Contiene la fotografia esatta della riga enea_practices (stessi nomi di
// colonna, stesso id), il rivenditore, lo stage, e i documenti in base64 con
// il loro sha256. Il file intero è firmato da contentSha256: l'import rifiuta
// tutto se anche una sola cosa non torna.
//
// Vincolo: nessuna connessione fra APR e la produzione. L'export lo fa
// l'amministratore a mano dal CRM vero (sola lettura), l'import lo fa lui
// nell'ombra. Questo modulo è TypeScript puro: gira nel browser e nei test.

export const CRM_OMBRA_EXPORT_VERSION = "crm-ombra-export-v1" as const;

// Colonne TEXT[] di enea_practices che contengono percorsi nello storage.
export const COLONNE_DOCUMENTI = ["documenti_enea_urls", "fatture_urls", "documenti_aggiuntivi_urls", "pratica_enea_conclusa_urls"] as const;

// I bucket in cui vivono i documenti di una pratica (vedi KanbanBoard.FileDownloadLink).
export const BUCKET_DOCUMENTI = ["documenti", "enea-documents"] as const;
export type BucketDocumenti = typeof BUCKET_DOCUMENTI[number];

export interface DocumentoEsportato {
  // Da dove viene il percorso: una colonna, oppure la chiave dentro dati_form.
  origine: string;
  path: string;
  bucket: BucketDocumenti;
  contentType: string | null;
  size: number;
  sha256: string;
  base64: string;
}

export interface EsportazionePratica {
  version: typeof CRM_OMBRA_EXPORT_VERSION;
  exportedAt: string;
  exportedBy: string;
  practiceId: string;
  practice: Record<string, unknown>;
  reseller: Record<string, unknown> | null;
  stage: { stage_type: string; name: string; brand: string | null } | null;
  documents: DocumentoEsportato[];
  contentSha256: string;
}

// Tutti i percorsi di documenti di una pratica: le quattro colonne più ogni
// stringa dentro dati_form che comincia con "<id pratica>/" (è così che il
// Kanban riconosce i file caricati dal cliente, qualunque sia il modulo).
export function percorsiDocumenti(practice: Record<string, unknown>): Array<{ origine: string; path: string }> {
  const trovati: Array<{ origine: string; path: string }> = [];
  const visti = new Set<string>();
  const aggiungi = (origine: string, path: unknown) => {
    if (typeof path !== "string" || !path.trim() || visti.has(path)) return;
    visti.add(path);
    trovati.push({ origine, path });
  };
  for (const colonna of COLONNE_DOCUMENTI) {
    const valore = practice[colonna];
    if (Array.isArray(valore)) valore.forEach((path) => aggiungi(colonna, path));
  }
  const id = String(practice.id ?? "");
  const raccogli = (nodo: unknown, chiave: string) => {
    if (typeof nodo === "string") { if (id && nodo.startsWith(`${id}/`)) aggiungi(`dati_form.${chiave}`, nodo); return; }
    if (Array.isArray(nodo)) { nodo.forEach((v) => raccogli(v, chiave)); return; }
    if (nodo && typeof nodo === "object") Object.entries(nodo as Record<string, unknown>).forEach(([k, v]) => raccogli(v, k));
  };
  raccogli(practice.dati_form, "documento");
  return trovati;
}

export async function sha256Hex(dati: Uint8Array | string): Promise<string> {
  const bytes = typeof dati === "string" ? new TextEncoder().encode(dati) : dati;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

// La firma copre tutto tranne se stessa. JSON.stringify segue l'ordine di
// inserimento delle chiavi: l'oggetto va costruito sempre nello stesso ordine.
function contenutoFirmato(esportazione: Omit<EsportazionePratica, "contentSha256">): string {
  const { version, exportedAt, exportedBy, practiceId, practice, reseller, stage, documents } = esportazione;
  return JSON.stringify({ version, exportedAt, exportedBy, practiceId, practice, reseller, stage, documents });
}

export async function firmaEsportazione(senzaFirma: Omit<EsportazionePratica, "contentSha256">): Promise<EsportazionePratica> {
  return { ...senzaFirma, contentSha256: await sha256Hex(contenutoFirmato(senzaFirma)) };
}

export function nomeFileEsportazione(practiceId: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
  return `pratica-ombra-${practiceId}-${stamp}.json`;
}

export type VerificaEsportazione = { ok: true; esportazione: EsportazionePratica } | { ok: false; errori: string[] };

// Fail closed: qualsiasi cosa non torni, il file è rifiutato per intero.
export async function verificaEsportazione(valore: unknown): Promise<VerificaEsportazione> {
  const errori: string[] = [];
  const e = valore as EsportazionePratica;
  if (!e || typeof e !== "object") return { ok: false, errori: ["Il file non è un oggetto JSON."] };
  if (e.version !== CRM_OMBRA_EXPORT_VERSION) errori.push(`Versione inattesa: ${String(e.version)} (attesa ${CRM_OMBRA_EXPORT_VERSION}).`);
  if (typeof e.practiceId !== "string" || !e.practiceId) errori.push("practiceId mancante.");
  if (!e.practice || typeof e.practice !== "object") errori.push("practice mancante.");
  else if (e.practice.id !== e.practiceId) errori.push("practice.id diverso da practiceId.");
  if (!Array.isArray(e.documents)) errori.push("documents non è una lista.");
  if (typeof e.contentSha256 !== "string") errori.push("contentSha256 mancante.");
  if (errori.length) return { ok: false, errori };

  const attesa = await sha256Hex(contenutoFirmato(e));
  if (attesa !== e.contentSha256) errori.push("contentSha256 non corrisponde al contenuto: file alterato o incompleto.");
  for (const [indice, documento] of e.documents.entries()) {
    if (!documento || typeof documento.path !== "string" || typeof documento.base64 !== "string" || !BUCKET_DOCUMENTI.includes(documento.bucket)) {
      errori.push(`Documento ${indice + 1}: forma non valida.`);
      continue;
    }
    let bytes: Uint8Array;
    try { bytes = base64ToBytes(documento.base64); } catch { errori.push(`Documento ${documento.path}: base64 non decodificabile.`); continue; }
    if (bytes.length !== documento.size) errori.push(`Documento ${documento.path}: dimensione ${bytes.length} diversa da ${documento.size}.`);
    if ((await sha256Hex(bytes)) !== documento.sha256) errori.push(`Documento ${documento.path}: sha256 non corrisponde.`);
  }
  return errori.length ? { ok: false, errori } : { ok: true, esportazione: e };
}

// Colonne che nell'ombra non possono restare come nel CRM vero: puntano a
// utenti (profiles) o stage (pipeline_stages) i cui id esistono solo lì.
export const COLONNE_DA_RIMAPPARE = ["current_stage_id", "operatore_id", "chiamate_assegnato_a"] as const;

export function rigaPerOmbra(practice: Record<string, unknown>, currentStageId: string): Record<string, unknown> {
  const riga: Record<string, unknown> = { ...practice };
  for (const colonna of COLONNE_DA_RIMAPPARE) riga[colonna] = null;
  riga.current_stage_id = currentStageId;
  return riga;
}
