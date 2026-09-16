import {
  BUCKET_DOCUMENTI,
  CRM_OMBRA_EXPORT_VERSION,
  bytesToBase64,
  firmaEsportazione,
  percorsiDocumenti,
  sha256Hex,
  type BucketDocumenti,
  type DocumentoEsportato,
  type EsportazionePratica,
} from "./exportFormat.ts";

// Esportazione dal CRM vero: SOLA LETTURA. Tre select e i download dei
// documenti; nessuna scrittura, nessuna automazione, nessun side effect.
// Il client è ridotto a ciò che serve, così il modulo si prova con un finto.

export interface ClientEsportazione {
  selectById: (table: string, id: string) => Promise<Record<string, unknown> | null>;
  download: (bucket: BucketDocumenti, path: string) => Promise<{ bytes: Uint8Array; contentType: string | null } | null>;
}

export type EsitoEsportazione =
  | { ok: true; esportazione: EsportazionePratica; avvisi: string[] }
  | { ok: false; errore: string };

export async function esportaPratica(client: ClientEsportazione, practiceId: string, exportedBy: string, now: Date): Promise<EsitoEsportazione> {
  const practice = await client.selectById("enea_practices", practiceId);
  if (!practice) return { ok: false, errore: `Pratica ${practiceId} non trovata in enea_practices.` };

  const resellerId = typeof practice.reseller_id === "string" ? practice.reseller_id : null;
  const reseller = resellerId ? await client.selectById("companies", resellerId) : null;

  const stageId = typeof practice.current_stage_id === "string" ? practice.current_stage_id : null;
  const stageRow = stageId ? await client.selectById("pipeline_stages", stageId) : null;
  const stage = stageRow ? { stage_type: String(stageRow.stage_type), name: String(stageRow.name), brand: typeof stageRow.brand === "string" ? stageRow.brand : null } : null;

  const avvisi: string[] = [];
  const documents: DocumentoEsportato[] = [];
  for (const { origine, path } of percorsiDocumenti(practice)) {
    let trovato: { bucket: BucketDocumenti; bytes: Uint8Array; contentType: string | null } | null = null;
    for (const bucket of BUCKET_DOCUMENTI) {
      const scaricato = await client.download(bucket, path);
      if (scaricato) { trovato = { bucket, ...scaricato }; break; }
    }
    if (!trovato) { avvisi.push(`Documento non trovato in nessun bucket: ${path} (${origine}).`); continue; }
    documents.push({ origine, path, bucket: trovato.bucket, contentType: trovato.contentType, size: trovato.bytes.length, sha256: await sha256Hex(trovato.bytes), base64: bytesToBase64(trovato.bytes) });
  }

  const esportazione = await firmaEsportazione({
    version: CRM_OMBRA_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    exportedBy,
    practiceId,
    practice,
    reseller,
    stage,
    documents,
  });
  return { ok: true, esportazione, avvisi };
}
