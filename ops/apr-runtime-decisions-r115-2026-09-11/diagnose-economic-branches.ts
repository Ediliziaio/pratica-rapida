import { readFileSync } from "node:fs";
import path from "node:path";
import { runEconomicVerticalForCurrentCohort } from "../../scripts/enea-shadow-runner/aprEconomicCorpusReplay";

const runnerRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const cases = [
  [6107, "ivana-mastrangelo"],
  [6108, "antonio-scaparrotta"],
  [6109, "eugenio-codognato"],
  [6114, "lucia-droghetti"],
  [6115, "francesco-laurelli"],
  [6116, "loretta-riviera"],
  [6118, "patrizia-muzzi"],
] as const;

const output = cases.map(([cohort, customerKey]) => {
  const cohortRoot = path.join(runnerRoot, "cohorts", `apr-pilot-${cohort}-global-controller-${customerKey}`);
  const local = JSON.parse(readFileSync(path.join(cohortRoot, "crm-local-preflight", "checkpoint.json"), "utf8"));
  const localItem = local.items?.find((item: { customerKey?: string }) => item.customerKey === customerKey);
  const vertical = runEconomicVerticalForCurrentCohort(cohortRoot, customerKey);
  return {
    cohort,
    customerKey,
    local: {
      outcome: localItem?.report?.outcome ?? null,
      blockerCodes: (localItem?.report?.blockers ?? []).map((item: { code?: string }) => item.code ?? null),
      finalPrintedTotalVerified: localItem?.report?.financial?.finalPrintedTotalVerified ?? null,
      total: localItem?.report?.financial?.eligibleExpense ?? null,
      evidence: (localItem?.report?.financial?.evidence ?? []).map((item: { sourceId?: string; kind?: string; grossTotal?: number | null; extractionConfidence?: string }) => ({
        sourceId: item.sourceId ?? null,
        kind: item.kind ?? null,
        grossTotal: item.grossTotal ?? null,
        extractionConfidence: item.extractionConfidence ?? null,
      })),
    },
    bridge: {
      outcome: vertical.outcome,
      total: vertical.eligibleExpense,
      usable: vertical.invoiceReconciliation.usable,
      blockerCodes: vertical.invoiceReconciliation.blockers,
      candidateInvoiceSourceIds: vertical.invoiceReconciliation.candidateInvoiceSourceIds,
      decisions: vertical.decisionsArtifact.payload.decisions.map((item) => ({ field: item.field, status: item.status, blockerCode: item.blockerCode, reason: item.reason })),
    },
  };
});

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
