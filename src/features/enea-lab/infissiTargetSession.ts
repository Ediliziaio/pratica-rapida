import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { loadReadOnlyInfissiPracticeByFullName } from "./readOnlyInfissiSource";
import { loadAprInfissiReadOnlyDocuments } from "./infissiReadOnlyDocuments";

export const APR_INFISSI_LIVE_TEST_TARGET = "Sebastian Costel Volf" as const;

export interface AprInfissiTargetSession {
  practiceId: string;
  practiceCode: string;
  target: typeof APR_INFISSI_LIVE_TEST_TARGET;
  reseller: string;
  queueStatus: "waiting_client" | "ready" | "historical";
  invoiceCount: number;
  technicalDocumentCount: number;
  completedEneaPath: string;
  technicalSourcePaths: string[];
  practice: NonNullable<Awaited<ReturnType<typeof loadReadOnlyInfissiPracticeByFullName>>>;
  documents: Awaited<ReturnType<typeof loadAprInfissiReadOnlyDocuments>>;
}

/**
 * Sessione di collaudo nominativa autorizzata dall'utente in chat.
 * È confinata alla sola pratica Sebastian Costel Volf e usa esclusivamente
 * SELECT/download. Se il nome è ambiguo, il prodotto non è Infissi o il reseller
 * è Erremme, il loader restituisce null a monte e questa funzione si ferma.
 */
export async function loadAprInfissiTargetSession(
  client: SupabaseClient<Database>,
): Promise<AprInfissiTargetSession> {
  const practice = await loadReadOnlyInfissiPracticeByFullName(client, APR_INFISSI_LIVE_TEST_TARGET);
  if (!practice) {
    throw new Error("Pratica Sebastian Costel Volf non individuata in modo univoco nel perimetro Infissi read-only");
  }
  if (/erremme/i.test(practice.reseller)) {
    throw new Error("Erremme è esclusa dal collaudo APR");
  }

  const documents = await loadAprInfissiReadOnlyDocuments(client, practice);
  return {
    practiceId: practice.id,
    practiceCode: practice.code,
    target: APR_INFISSI_LIVE_TEST_TARGET,
    reseller: practice.reseller,
    queueStatus: practice.queueStatus,
    invoiceCount: practice.fattureCount,
    technicalDocumentCount: documents.technicalSources.length,
    completedEneaPath: documents.completedEneaPath,
    technicalSourcePaths: documents.technicalSources.map(({ path }) => path),
    practice,
    documents,
  };
}
