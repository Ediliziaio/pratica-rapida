import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { analyzePracticeDocuments } from "./documentAnalysis";
import { auditCompletedEneaPractice, type CompletedEneaAuditResult } from "./completedEneaAudit";
import { mapSchermaturaPractice } from "./mapper";
import { validatePreparedPractice } from "./preparation";
import { loadReadOnlyEneaHistoricalQueue } from "./readOnlySource";
import type { EneaLabMappedPractice } from "./types";

export type HistoricalAuditOutcome = "match" | "blocked" | "difference" | "error";

export interface HistoricalPracticeAudit {
  practiceCode: string;
  outcome: HistoricalAuditOutcome;
  compared: number;
  matches: number;
  mismatches: number;
  blockerCount: number;
  differenceFieldIds: string[];
  blockedDifferenceFieldIds: string[];
  error?: string;
}

export interface HistoricalBatchAuditReport {
  requested: number;
  available: number;
  audited: number;
  matches: number;
  correctlyBlocked: number;
  differences: number;
  errors: number;
  practices: HistoricalPracticeAudit[];
}

// Un PDF ENEA conclusivo per schermature contiene normalmente decine di campi
// confrontabili. Una manciata di coincidenze non e' evidenza sufficiente per
// certificare il mapper: potrebbe indicare un parser parziale o un documento
// diverso da quello atteso. Il collaudo storico deve quindi fallire chiuso.
const MIN_HISTORICAL_COMPARISONS = 10;

function normalizedCpid(cpid: string): string {
  return cpid.trim().toUpperCase();
}

function isValidHistoricalCpid(cpid: string | null): cpid is string {
  if (!cpid) return false;
  // Le pratiche Ecobonus osservate usano la forma numero-AAAAE-token.
  // Una stringa parziale o generica non deve bastare a certificare un match.
  return /^\d+-\d{4}E-[A-Z0-9]+$/i.test(cpid.trim());
}

/**
 * Se una pratica ha piu PDF conclusivi/duplicati, non basta prendere il primo
 * file leggibile: potrebbe essere una copia parziale o un documento intermedio.
 * Preferiamo prima un documento con CPID strutturalmente valido (prova che e'
 * una pratica Ecobonus conclusa) e, a parita, quello che offre la maggiore
 * copertura di campi confrontabili. Non usiamo il numero di match come criterio,
 * per non scegliere il PDF che "fa apparire migliore" il mapper corrente.
 *
 * Fail-safe aggiuntivo: due CPID validi diversi nella stessa pratica indicano
 * allegati incoerenti o una pratica ENEA estranea. In quel caso non scegliamo
 * arbitrariamente un documento: l'audit deve fermarsi e richiedere verifica.
 */
export function selectBestHistoricalCompletedAudit(
  candidates: readonly CompletedEneaAuditResult[],
): CompletedEneaAuditResult | null {
  const distinctCpids = new Set(
    candidates
      .map(({ cpid }) => cpid)
      .filter(isValidHistoricalCpid)
      .map(normalizedCpid),
  );
  if (distinctCpids.size > 1) {
    throw new Error("PDF ENEA conclusivi con CPID discordanti nella stessa pratica.");
  }

  let best: CompletedEneaAuditResult | null = null;

  for (const candidate of candidates) {
    if (!best) {
      best = candidate;
      continue;
    }

    const candidateHasCpid = isValidHistoricalCpid(candidate.cpid);
    const bestHasCpid = isValidHistoricalCpid(best.cpid);
    if (candidateHasCpid !== bestHasCpid) {
      if (candidateHasCpid) best = candidate;
      continue;
    }

    if (candidate.compared > best.compared) best = candidate;
  }

  return best;
}

async function auditBestHistoricalCompletedEneaPractice(
  client: SupabaseClient<Database>,
  mapped: EneaLabMappedPractice,
): Promise<CompletedEneaAuditResult> {
  const paths = mapped.source.completedEneaPaths ?? [];
  const candidates: CompletedEneaAuditResult[] = [];

  // auditCompletedEneaPractice resta fail-safe e valida path/tipo/dimensione.
  // Qui lo invochiamo su un path alla volta, cosi un primo PDF parziale non
  // impedisce di valutare un PDF conclusivo migliore presente nella stessa pratica.
  for (const path of paths) {
    try {
      candidates.push(await auditCompletedEneaPractice(client, {
        ...mapped,
        source: {
          ...mapped.source,
          completedEneaPaths: [path],
        },
      }));
    } catch {
      // Un allegato illeggibile non deve interrompere la ricerca degli altri
      // candidati; l'errore viene sollevato solo se nessun PDF e' utilizzabile.
    }
  }

  const best = selectBestHistoricalCompletedAudit(candidates);
  if (!best) throw new Error("Nessun PDF ENEA conclusivo leggibile per l'audit.");
  return best;
}

export function classifyHistoricalAudit(
  audit: CompletedEneaAuditResult,
  blockerFieldIds: ReadonlySet<string>,
): Pick<HistoricalPracticeAudit, "outcome" | "differenceFieldIds" | "blockedDifferenceFieldIds"> {
  const differenceFieldIds = audit.differences.map(({ fieldId }) => fieldId);
  const blockedDifferenceFieldIds = differenceFieldIds.filter((fieldId) => blockerFieldIds.has(fieldId));

  // Fail-safe: un PDF leggibile senza alcun campo realmente confrontabile non
  // dimostra che il mapper corrente coincida con la pratica conclusa. Non deve
  // quindi produrre un falso "match" solo perché 0 mismatch su 0 confronti.
  if (audit.compared === 0) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // Il CPID identifica la pratica ENEA conclusa. Non basta che sia non vuoto:
  // deve avere la struttura osservata delle pratiche Ecobonus, altrimenti un
  // parsing tronco potrebbe produrre una falsa prova di conclusione.
  if (!isValidHistoricalCpid(audit.cpid)) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // Fail-safe di copertura: CPID + poche coincidenze possono ancora provenire
  // da un parsing incompleto. Per schermature, sotto questa soglia il risultato
  // resta una differenza da investigare e non viene mai promosso a match/blocked.
  if (audit.compared < MIN_HISTORICAL_COMPARISONS) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // Un confronto dei valori può essere perfetto e tuttavia il workflow attuale
  // può avere blocker (per esempio un gTot non documentato che per coincidenza
  // è uguale al valore usato nella pratica storica). In quel caso la pratica
  // non è automatizzabile end-to-end e non deve gonfiare il conteggio "match".
  if (audit.mismatches === 0 && blockerFieldIds.size > 0) {
    return { outcome: "blocked", differenceFieldIds, blockedDifferenceFieldIds };
  }
  if (audit.mismatches === 0) {
    return { outcome: "match", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // Fail-safe: un contatore mismatch senza dettaglio dei campi non può essere
  // considerato "correttamente bloccato" solo perché 0 === 0. Lo trattiamo
  // come differenza reale finché l'audit non spiega quali campi divergono.
  if (differenceFieldIds.length === 0) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  if (blockedDifferenceFieldIds.length === differenceFieldIds.length) {
    return { outcome: "blocked", differenceFieldIds, blockedDifferenceFieldIds };
  }
  return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
}

/**
 * Collaudo retrospettivo completamente read-only sulle pratiche concluse.
 * Non restituisce nomi, email, CF o altri dati personali: il report usa solo
 * il codice tecnico CRM e gli id dei campi che differiscono.
 */
export async function runHistoricalEneaBatchAudit(
  client: SupabaseClient<Database>,
  limit = 5,
): Promise<HistoricalBatchAuditReport> {
  const requested = Math.max(1, Math.min(20, Math.trunc(limit)));
  const historical = await loadReadOnlyEneaHistoricalQueue(client);
  const selected = historical.slice(0, requested);
  const practices: HistoricalPracticeAudit[] = [];

  for (const practice of selected) {
    try {
      const analysis = await analyzePracticeDocuments(client, practice);
      const mapped = mapSchermaturaPractice(practice, analysis, { includeTestConventions: false });
      // Per il collaudo storico la presenza del PDF finale prova che la pratica è
      // arrivata a conclusione: non va classificata come "modulo cliente in attesa".
      const validationSource = { ...practice, queueStatus: "ready" as const };
      const issues = validatePreparedPractice(validationSource, mapped, analysis);
      const blockerFieldIds = new Set(
        issues
          .filter((issue) => issue.severity === "blocker" && issue.fieldId)
          .map((issue) => issue.fieldId!),
      );
      const audit = await auditBestHistoricalCompletedEneaPractice(client, mapped);
      const classified = classifyHistoricalAudit(audit, blockerFieldIds);
      practices.push({
        practiceCode: practice.code,
        outcome: classified.outcome,
        compared: audit.compared,
        matches: audit.matches,
        mismatches: audit.mismatches,
        blockerCount: issues.filter((issue) => issue.severity === "blocker").length,
        differenceFieldIds: classified.differenceFieldIds,
        blockedDifferenceFieldIds: classified.blockedDifferenceFieldIds,
      });
    } catch (error) {
      practices.push({
        practiceCode: practice.code,
        outcome: "error",
        compared: 0,
        matches: 0,
        mismatches: 0,
        blockerCount: 0,
        differenceFieldIds: [],
        blockedDifferenceFieldIds: [],
        error: error instanceof Error ? error.message : "Audit storico non riuscito.",
      });
    }
  }

  return {
    requested,
    available: historical.length,
    audited: practices.length,
    matches: practices.filter(({ outcome }) => outcome === "match").length,
    correctlyBlocked: practices.filter(({ outcome }) => outcome === "blocked").length,
    differences: practices.filter(({ outcome }) => outcome === "difference").length,
    errors: practices.filter(({ outcome }) => outcome === "error").length,
    practices,
  };
}
