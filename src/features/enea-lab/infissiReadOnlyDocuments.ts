import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { extractPdfText } from "./documentAnalysis";
import { parseCompletedEneaInfissiText, type CompletedEneaInfissiSnapshot } from "./completedEneaInfissi";
import { parseCompletedEneaInfissiCommon } from "./infissiCommonCompletedAudit";
import type { CompletedEneaSnapshot } from "./completedEneaAudit";
import type { EneaLabSourcePractice } from "./types";

export interface AprInfissiReadOnlyDocumentText {
  path: string;
  kind: "invoice" | "additional";
  text: string;
}

export interface AprInfissiReadOnlyDocumentBundle {
  technicalSources: AprInfissiReadOnlyDocumentText[];
  completedEnea: CompletedEneaInfissiSnapshot;
  completedEneaCommon: CompletedEneaSnapshot;
  completedEneaPath: string;
}

async function downloadPdfText(
  client: SupabaseClient<Database>,
  practiceId: string,
  path: string,
): Promise<string> {
  if (!path.startsWith(`${practiceId}/`)) throw new Error("Percorso documento fuori dalla pratica selezionata");
  if (!/\.pdf$/i.test(path)) throw new Error("APR Infissi accetta solo PDF testuali nel corpus automatico");
  const { data, error } = await client.storage.from("enea-documents").download(path);
  if (error || !data) throw new Error(error?.message ?? "Download documento non riuscito");
  if (data.size > 20 * 1024 * 1024) throw new Error("Documento superiore a 20 MB");
  return extractPdfText(data);
}

/**
 * Legge soltanto i documenti già collegati alla pratica CRM.
 * Il PDF ENEA concluso viene parsato due volte sullo stesso testo: sezioni comuni
 * e tabella tecnica Infissi, ma non viene mai mescolato ai documenti operativi.
 */
export async function loadAprInfissiReadOnlyDocuments(
  client: SupabaseClient<Database>,
  practice: EneaLabSourcePractice,
): Promise<AprInfissiReadOnlyDocumentBundle> {
  if (practice.form.prodotto.tipo !== "infissi") throw new Error("Pratica non Infissi");
  if (practice.completedEneaPaths?.length !== 1) {
    throw new Error("Serve esattamente un PDF ENEA concluso appartenente alla pratica");
  }

  const completedEneaPath = practice.completedEneaPaths[0];
  const completedText = await downloadPdfText(client, practice.id, completedEneaPath);
  const completedEnea = parseCompletedEneaInfissiText(completedText);
  const completedEneaCommon = parseCompletedEneaInfissiCommon(completedText);
  if (!completedEnea.items.length) throw new Error("Il PDF concluso non contiene la tabella Serramenti e infissi");
  if (!Object.keys(completedEneaCommon.fields).length) throw new Error("Il PDF concluso non contiene sezioni comuni ENEA leggibili");

  const sourcePaths = practice.documentPaths.filter(({ kind, path }) =>
    (kind === "invoice" || kind === "additional") && path !== completedEneaPath,
  );
  const technicalSources: AprInfissiReadOnlyDocumentText[] = [];
  for (const source of sourcePaths) {
    technicalSources.push({
      path: source.path,
      kind: source.kind as "invoice" | "additional",
      text: await downloadPdfText(client, practice.id, source.path),
    });
  }

  return { technicalSources, completedEnea, completedEneaCommon, completedEneaPath };
}
