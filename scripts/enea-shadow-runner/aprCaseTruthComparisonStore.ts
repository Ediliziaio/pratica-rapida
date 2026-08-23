import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AprCaseStatusTruth } from "./caseStatusTruth";
import type { AprCollectedCaseObservations } from "./aprCaseObservationCollector";
import type { AprCaseStatusObservation, AprImmutableArtifactEnvelope, AprPublicCaseStatus } from "./aprMonotonicArtifacts";
import { canonicalJson, envelopeImmutableArtifact, verifyImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
import { resolveAprCaseStatusTruth, type AprResolvedCaseStatus } from "./aprCaseStatusResolver";

export const APR_CASE_TRUTH_COMPARISON_VERSION = "apr-case-truth-comparison-v1" as const;
export type AprTruthComparisonClassification = "AGREE" | "EXPECTED_STRICTER" | "DISAGREE" | "MISSING_SOURCE";

export interface AprCaseTruthComparisonPayload {
  schemaVersion: typeof APR_CASE_TRUTH_COMPARISON_VERSION;
  customerKey: string;
  runId: string;
  createdAt: string;
  corpusFingerprint: string;
  sourceAggregateFingerprint: string;
  oldTruth: { status: AprCaseStatusTruth["status"]; blockerCodes: readonly string[]; statement: string };
  newTruth: AprResolvedCaseStatus;
  oldNormalizedStatus: AprPublicCaseStatus;
  classification: AprTruthComparisonClassification;
  reason: string;
  blockerCodes: { old: readonly string[]; current: readonly string[] };
  observations: readonly AprCaseStatusObservation[];
  audit: readonly [{ type: "parallel_truth_compared"; at: string; runId: string }];
}

export type AprCaseTruthComparison = AprImmutableArtifactEnvelope<AprCaseTruthComparisonPayload>;

const normalizeOldStatus = (status: AprCaseStatusTruth["status"]): AprPublicCaseStatus => {
  switch (status) {
    case "BLOCKED": return "OPERATOR_REQUIRED";
    case "READY": case "TECHNICAL_BLOCK": case "IN_PROGRESS": case "DEFERRED": case "INCONSISTENT": return status;
  }
};

const currentBlockers = (observations: readonly AprCaseStatusObservation[]) => [...new Set(observations.flatMap((item) => item.blockerCodes))].sort();

export function compareAprParallelCaseTruth(input: {
  oldTruth: AprCaseStatusTruth;
  collected: AprCollectedCaseObservations;
  now?: Date;
}): AprCaseTruthComparison {
  const createdAt = (input.now ?? new Date()).toISOString();
  const oldNormalizedStatus = normalizeOldStatus(input.oldTruth.status);
  const newTruth = resolveAprCaseStatusTruth(input.collected.observations);
  let classification: AprTruthComparisonClassification;
  let reason: string;
  if (input.collected.status === "REJECTED" || /fonte obbligatoria mancante/i.test(newTruth.reason)) {
    classification = "MISSING_SOURCE";
    reason = `Nuova verità non calcolabile con fonti complete: ${newTruth.reason}`;
  } else if (oldNormalizedStatus === newTruth.status) {
    classification = "AGREE";
    reason = `Vecchia e nuova verità concordano su ${newTruth.status}.`;
  } else if (newTruth.status === "INCONSISTENT" && newTruth.disagreement && newTruth.disagreement.length > 0
    && /(?:duplicata|non applicabile|combinazione di stati non prevista)/i.test(newTruth.reason)) {
    classification = "EXPECTED_STRICTER";
    reason = `La nuova verità rende visibile un disaccordo prima nascosto: ${newTruth.reason}`;
  } else {
    classification = "DISAGREE";
    reason = `Vecchia verità ${oldNormalizedStatus}, nuova verità ${newTruth.status}: ${newTruth.reason}`;
  }
  return envelopeImmutableArtifact({
    schemaVersion: APR_CASE_TRUTH_COMPARISON_VERSION,
    customerKey: input.collected.customerKey,
    runId: input.collected.runId,
    createdAt,
    corpusFingerprint: input.collected.corpusFingerprint,
    sourceAggregateFingerprint: input.collected.sourceAggregateFingerprint,
    oldTruth: { status: input.oldTruth.status, blockerCodes: [...input.oldTruth.blockerCodes].sort(), statement: input.oldTruth.statement },
    newTruth,
    oldNormalizedStatus,
    classification,
    reason,
    blockerCodes: { old: [...input.oldTruth.blockerCodes].sort(), current: currentBlockers(input.collected.observations) },
    observations: input.collected.observations,
    audit: [{ type: "parallel_truth_compared", at: createdAt, runId: input.collected.runId }] as const,
  });
}

export class PersistentAprCaseTruthComparisonStore {
  readonly directory: string;
  constructor(rootDirectory: string) { this.directory = path.join(path.resolve(rootDirectory), "case-truth-comparison", "artifacts"); }

  persist(comparison: AprCaseTruthComparison) {
    if (!verifyImmutableArtifactEnvelope(comparison)) throw new Error("apr_case_truth_comparison_envelope_invalid");
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const target = path.join(this.directory, `${comparison.artifactId}.json`);
    const contents = `${canonicalJson(comparison)}\n`;
    if (existsSync(target)) {
      if (readFileSync(target, "utf8") !== contents) throw new Error("apr_case_truth_comparison_immutable_collision");
      return { path: target, created: false, comparison };
    }
    const descriptor = openSync(target, "wx", 0o600);
    try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
    const directory = openSync(this.directory, "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
    return { path: target, created: true, comparison };
  }

  load(artifactId: string): AprCaseTruthComparison {
    if (!/^[a-f0-9]{64}$/.test(artifactId)) throw new Error("apr_case_truth_comparison_artifact_id_invalid");
    const value = JSON.parse(readFileSync(path.join(this.directory, `${artifactId}.json`), "utf8")) as AprCaseTruthComparison;
    if (!verifyImmutableArtifactEnvelope(value)) throw new Error("apr_case_truth_comparison_persisted_invalid");
    return value;
  }

  list(customerKey?: string): AprCaseTruthComparison[] {
    if (!existsSync(this.directory)) return [];
    return readdirSync(this.directory)
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .map((name) => this.load(name.slice(0, -5)))
      .filter((comparison) => !customerKey || comparison.payload.customerKey === customerKey)
      .sort((left, right) => left.payload.createdAt.localeCompare(right.payload.createdAt) || left.artifactId.localeCompare(right.artifactId));
  }
}
