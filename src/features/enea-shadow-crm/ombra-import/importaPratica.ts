import { base64ToBytes, rigaPerOmbra, verificaEsportazione, type BucketDocumenti, type EsportazionePratica } from "./exportFormat.ts";

// Importazione nel CRM ombra. Regole:
//  - il file viene verificato per intero (firma, sha256 dei documenti) prima
//    di toccare qualsiasi cosa;
//  - una pratica già presente NON si sovrascrive: si ferma e lo dice. Una
//    pratica in lavorazione da APR non va sostituita sotto i piedi;
//  - stessi id del CRM vero (pratica, rivenditore, percorsi dei documenti):
//    a fine corsa il confronto è per id;
//  - lo stage si rimappa per (stage_type, brand): gli id degli stage sono
//    diversi fra i due database. Operatore e assegnatario chiamate vanno a
//    null: sono utenti del CRM vero.
// Nessuna automazione: i trigger di enea_practices scattano su UPDATE, non su
// INSERT, e comunque nell'ombra le funzioni in uscita sono bloccate.

export interface ClientImportazione {
  exists: (table: string, id: string) => Promise<boolean>;
  insert: (table: string, row: Record<string, unknown>) => Promise<void>;
  findSystemStage: (stageType: string, brand: string | null) => Promise<string | null>;
  upload: (bucket: BucketDocumenti, path: string, bytes: Uint8Array, contentType: string | null) => Promise<"caricato" | "gia_presente">;
}

export interface RapportoImportazione {
  practiceId: string;
  stageId: string;
  stageType: string;
  rivenditoreCreato: boolean;
  documentiCaricati: number;
  documentiGiaPresenti: number;
}

export type EsitoImportazione = { ok: true; rapporto: RapportoImportazione } | { ok: false; errori: string[] };

export async function importaPratica(client: ClientImportazione, contenutoFile: unknown): Promise<EsitoImportazione> {
  const verifica = await verificaEsportazione(contenutoFile);
  if (verifica.ok === false) return { ok: false, errori: verifica.errori };
  const e: EsportazionePratica = verifica.esportazione;

  if (await client.exists("enea_practices", e.practiceId)) {
    return { ok: false, errori: [`La pratica ${e.practiceId} è già presente nel CRM ombra: non viene sovrascritta. Se va davvero sostituita, eliminarla prima a mano.`] };
  }

  const stageType = e.stage?.stage_type ?? "pronte_da_fare";
  const brand = typeof e.practice.brand === "string" ? e.practice.brand : e.stage?.brand ?? null;
  const stageId = await client.findSystemStage(stageType, brand);
  if (!stageId) return { ok: false, errori: [`Nel CRM ombra non esiste lo stage di sistema "${stageType}" per il brand "${brand ?? "-"}": eseguire prima le migrazioni (seed pipeline_stages).`] };

  let rivenditoreCreato = false;
  const resellerId = typeof e.practice.reseller_id === "string" ? e.practice.reseller_id : null;
  if (resellerId && !(await client.exists("companies", resellerId))) {
    if (!e.reseller) return { ok: false, errori: [`La pratica punta al rivenditore ${resellerId}, che nel CRM ombra non esiste e nel file non c'è.`] };
    await client.insert("companies", e.reseller);
    rivenditoreCreato = true;
  }

  let documentiCaricati = 0;
  let documentiGiaPresenti = 0;
  for (const documento of e.documents) {
    const esito = await client.upload(documento.bucket, documento.path, base64ToBytes(documento.base64), documento.contentType);
    if (esito === "caricato") documentiCaricati += 1; else documentiGiaPresenti += 1;
  }

  await client.insert("enea_practices", rigaPerOmbra(e.practice, stageId));

  return { ok: true, rapporto: { practiceId: e.practiceId, stageId, stageType, rivenditoreCreato, documentiCaricati, documentiGiaPresenti } };
}
