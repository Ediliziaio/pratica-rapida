import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { analyzePracticeDocuments } from "./documentAnalysis";
import { auditCompletedEneaPractice, type CompletedEneaAuditResult } from "./completedEneaAudit";
import { mapSchermaturaPractice } from "./mapper";
import { validatePreparedPractice } from "./preparation";
import { loadReadOnlyEneaHistoricalQueue } from "./readOnlySource";

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

export function classifyHistoricalAudit(
  audit: CompletedEneaAuditResult,
  blockerFieldIds: ReadonlySet<string>,
): Pick<HistoricalPracticeAudit, "outcome" | "differenceFieldIds" | "blockedDifferenceFieldIds"> {
  const differenceFieldIds = audit.differences.map(({ fieldId }) => fieldId);
  const blockedDifferenceFieldIds = differenceFieldIds.filter((fieldId) => blockerFieldIds.has(fieldId));

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
      const audit = await auditCompletedEneaPractice(client, mapped);
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
