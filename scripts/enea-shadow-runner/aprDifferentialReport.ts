import type { AprInputCorpusFingerprint, AprPublicCaseStatus } from "./aprMonotonicArtifacts";
import { canonicalJson, canonicalSha256, envelopeImmutableArtifact, type AprImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
import { compareAprInputCorpusFingerprint } from "./aprCorpusFingerprint";

export const APR_DIFFERENTIAL_REPORT_VERSION = "apr-differential-report-v1" as const;

export type AprDifferentialClassification = "IMPROVED" | "REGRESSED" | "UNCHANGED" | "CHANGED";

export interface AprDifferentialCaseSnapshot {
  customerKey: string;
  status: AprPublicCaseStatus;
  blockerCodes: readonly string[];
  payloadFingerprint: string | null;
  appliedRuleIds: readonly string[];
}

export interface AprDifferentialSnapshot {
  runId: string;
  inputCorpusFingerprint: AprInputCorpusFingerprint;
  cases: readonly AprDifferentialCaseSnapshot[];
}

export interface AprDifferentialRow {
  customerKey: string;
  previousStatus: AprPublicCaseStatus;
  currentStatus: AprPublicCaseStatus;
  previousBlockers: readonly string[];
  currentBlockers: readonly string[];
  blockersAdded: readonly string[];
  blockersRemoved: readonly string[];
  previousPayloadFingerprint: string | null;
  currentPayloadFingerprint: string | null;
  appliedRuleIds: readonly string[];
  classification: AprDifferentialClassification;
  critical: boolean;
  explanation: string;
}

export interface AprDifferentialReportPayload {
  schemaVersion: typeof APR_DIFFERENTIAL_REPORT_VERSION;
  kind: "REPLAY_DIFFERENTIAL";
  generatedAt: string;
  baselineRunId: string;
  candidateRunId: string;
  inputCorpusFingerprint: AprInputCorpusFingerprint;
  rows: readonly AprDifferentialRow[];
  status: "PASS" | "FAIL";
  hasCriticalRegression: boolean;
  rejectionReasons: readonly string[];
  summary: Record<"improved" | "regressed" | "unchanged" | "changed", number>;
}

export type AprDifferentialReport = AprImmutableArtifactEnvelope<AprDifferentialReportPayload>;

const verified = (status: AprPublicCaseStatus) => status === "READY" || status === "COMPLETED";
const sorted = (values: readonly string[]) => [...new Set(values)].sort();

function row(before: AprDifferentialCaseSnapshot, after: AprDifferentialCaseSnapshot | undefined): AprDifferentialRow {
  if (!after) return {
    customerKey: before.customerKey,
    previousStatus: before.status,
    currentStatus: "INCONSISTENT",
    previousBlockers: sorted(before.blockerCodes),
    currentBlockers: ["case_missing_from_candidate"],
    blockersAdded: ["case_missing_from_candidate"],
    blockersRemoved: sorted(before.blockerCodes),
    previousPayloadFingerprint: before.payloadFingerprint,
    currentPayloadFingerprint: null,
    appliedRuleIds: [],
    classification: "REGRESSED",
    critical: true,
    explanation: "La pratica presente nella baseline manca dal candidato: regressione critica.",
  };
  const previousBlockers = sorted(before.blockerCodes); const currentBlockers = sorted(after.blockerCodes);
  const blockersAdded = currentBlockers.filter((code) => !previousBlockers.includes(code));
  const blockersRemoved = previousBlockers.filter((code) => !currentBlockers.includes(code));
  const payloadChanged = before.payloadFingerprint !== after.payloadFingerprint;
  const rulesChanged = canonicalJson(sorted(before.appliedRuleIds)) !== canonicalJson(sorted(after.appliedRuleIds));
  const stateRegressed = verified(before.status) && !verified(after.status)
    || before.status === "COMPLETED" && after.status === "READY";
  const critical = stateRegressed || verified(before.status) && payloadChanged;
  let classification: AprDifferentialClassification;
  let explanation: string;
  if (critical) {
    classification = "REGRESSED";
    explanation = stateRegressed
      ? `Stato regredito da ${before.status} a ${after.status}.`
      : `Payload verificato modificato mantenendo lo stato ${after.status}.`;
  } else if ((!verified(before.status) && verified(after.status)) || before.status === "READY" && after.status === "COMPLETED") {
    classification = "IMPROVED";
    explanation = `Stato migliorato da ${before.status} a ${after.status}.`;
  } else if (before.status === after.status && !payloadChanged && blockersAdded.length === 0 && blockersRemoved.length === 0 && !rulesChanged) {
    classification = "UNCHANGED";
    explanation = `Stato, payload, blocker e regole invariati (${after.status}).`;
  } else {
    classification = "CHANGED";
    explanation = `Caso modificato senza regressione critica: ${before.status} → ${after.status}; blocker +${blockersAdded.length}/-${blockersRemoved.length}; payload ${payloadChanged ? "modificato" : "invariato"}.`;
  }
  return { customerKey: before.customerKey, previousStatus: before.status, currentStatus: after.status, previousBlockers, currentBlockers,
    blockersAdded, blockersRemoved, previousPayloadFingerprint: before.payloadFingerprint, currentPayloadFingerprint: after.payloadFingerprint,
    appliedRuleIds: sorted(after.appliedRuleIds), classification, critical, explanation };
}

function indexCases(cases: readonly AprDifferentialCaseSnapshot[], label: string, rejectionReasons: string[]) {
  const result = new Map<string, AprDifferentialCaseSnapshot>();
  for (const item of cases) {
    if (!item.customerKey || result.has(item.customerKey)) rejectionReasons.push(`${label}: customerKey vuoto o duplicato (${item.customerKey || "vuoto"}).`);
    else result.set(item.customerKey, item);
  }
  return result;
}

export function buildAprDifferentialReport(input: {
  baseline: AprDifferentialSnapshot;
  candidate: AprDifferentialSnapshot;
  now?: Date;
}): AprDifferentialReport {
  const rejectionReasons: string[] = [];
  const corpusComparison = compareAprInputCorpusFingerprint(input.baseline.inputCorpusFingerprint, input.candidate.inputCorpusFingerprint);
  if (!corpusComparison.matches) rejectionReasons.push(`Corpus candidato differente dalla baseline: ${canonicalJson(corpusComparison)}.`);
  const baselineByKey = indexCases(input.baseline.cases, "baseline", rejectionReasons);
  const candidateByKey = indexCases(input.candidate.cases, "candidate", rejectionReasons);
  const expectedKeys = input.baseline.inputCorpusFingerprint.perCaseSources.map((item) => item.customerKey).sort();
  if (baselineByKey.size !== 40 || canonicalJson([...baselineByKey.keys()].sort()) !== canonicalJson(expectedKeys)) rejectionReasons.push("La baseline non contiene esattamente i 40 casi del corpus.");
  if (candidateByKey.size !== 40 || canonicalJson([...candidateByKey.keys()].sort()) !== canonicalJson(expectedKeys)) rejectionReasons.push("Il candidato non contiene esattamente i 40 casi del corpus.");
  const rows = expectedKeys.map((customerKey) => {
    const before = baselineByKey.get(customerKey);
    if (!before) return {
      customerKey, previousStatus: "INCONSISTENT", currentStatus: "INCONSISTENT", previousBlockers: ["case_missing_from_baseline"], currentBlockers: [], blockersAdded: [], blockersRemoved: ["case_missing_from_baseline"],
      previousPayloadFingerprint: null, currentPayloadFingerprint: candidateByKey.get(customerKey)?.payloadFingerprint ?? null, appliedRuleIds: sorted(candidateByKey.get(customerKey)?.appliedRuleIds ?? []),
      classification: "REGRESSED", critical: true, explanation: "La pratica prevista dal corpus manca dalla baseline: confronto non valido.",
    } satisfies AprDifferentialRow;
    return row(before, candidateByKey.get(customerKey));
  });
  for (const key of candidateByKey.keys()) if (!expectedKeys.includes(key)) rejectionReasons.push(`Pratica candidata estranea al corpus: ${key}.`);
  const hasCriticalRegression = rows.some((item) => item.critical);
  if (hasCriticalRegression) rejectionReasons.push("Almeno una regressione critica rilevata.");
  const status = rejectionReasons.length === 0 ? "PASS" as const : "FAIL" as const;
  return envelopeImmutableArtifact({
    schemaVersion: APR_DIFFERENTIAL_REPORT_VERSION,
    kind: "REPLAY_DIFFERENTIAL",
    generatedAt: (input.now ?? new Date()).toISOString(),
    baselineRunId: input.baseline.runId,
    candidateRunId: input.candidate.runId,
    inputCorpusFingerprint: input.baseline.inputCorpusFingerprint,
    rows,
    status,
    hasCriticalRegression,
    rejectionReasons: sorted(rejectionReasons),
    summary: {
      improved: rows.filter((item) => item.classification === "IMPROVED").length,
      regressed: rows.filter((item) => item.classification === "REGRESSED").length,
      unchanged: rows.filter((item) => item.classification === "UNCHANGED").length,
      changed: rows.filter((item) => item.classification === "CHANGED").length,
    },
  });
}
