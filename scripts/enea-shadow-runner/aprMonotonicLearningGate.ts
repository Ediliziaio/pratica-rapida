export const APR_MONOTONIC_LEARNING_GATE_VERSION = "apr-monotonic-learning-gate-v1" as const;

export type AprLearningOutcome = "READY" | "OPERATOR_REQUIRED" | "INCONSISTENT";
export interface AprLearningCaseSnapshot {
  customerKey: string;
  state: AprLearningOutcome;
  payloadFingerprint?: string | null;
}

export interface AprLearningSnapshot {
  corpusFingerprint: string;
  cases: readonly AprLearningCaseSnapshot[];
}

export interface AprLearningRegression {
  customerKey: string;
  kind: "case_missing" | "ready_regressed" | "new_inconsistent" | "verified_payload_changed";
  before: string;
  after: string;
}

export function evaluateAprMonotonicLearningGate(input: {
  baseline: AprLearningSnapshot;
  candidate: AprLearningSnapshot;
  mode: "maintenance" | "learning";
}) {
  if (!input.baseline.corpusFingerprint || input.baseline.corpusFingerprint !== input.candidate.corpusFingerprint) {
    throw new Error("apr_monotonic_gate_corpus_mismatch");
  }
  const candidateByKey = new Map(input.candidate.cases.map((item) => [item.customerKey, item]));
  const regressions: AprLearningRegression[] = [];
  for (const before of input.baseline.cases) {
    const after = candidateByKey.get(before.customerKey);
    if (!after) {
      regressions.push({ customerKey: before.customerKey, kind: "case_missing", before: before.state, after: "missing" });
      continue;
    }
    if (before.state === "READY" && after.state !== "READY") {
      regressions.push({ customerKey: before.customerKey, kind: "ready_regressed", before: before.state, after: after.state });
    }
    if (before.state !== "INCONSISTENT" && after.state === "INCONSISTENT") {
      regressions.push({ customerKey: before.customerKey, kind: "new_inconsistent", before: before.state, after: after.state });
    }
    if (before.state === "READY" && after.state === "READY" && before.payloadFingerprint && after.payloadFingerprint
      && before.payloadFingerprint !== after.payloadFingerprint) {
      regressions.push({ customerKey: before.customerKey, kind: "verified_payload_changed", before: before.payloadFingerprint, after: after.payloadFingerprint });
    }
  }
  const baselineReady = input.baseline.cases.filter((item) => item.state === "READY").length;
  const candidateReady = input.candidate.cases.filter((item) => item.state === "READY").length;
  const improvedKeys = input.baseline.cases.filter((before) => before.state !== "READY" && candidateByKey.get(before.customerKey)?.state === "READY").map((item) => item.customerKey);
  const improvementRequiredButMissing = input.mode === "learning" && improvedKeys.length === 0;
  return {
    version: APR_MONOTONIC_LEARNING_GATE_VERSION,
    status: regressions.length === 0 && !improvementRequiredButMissing ? "PASS" as const : "FAIL" as const,
    baselineReady,
    candidateReady,
    improvedKeys,
    regressions,
    improvementRequiredButMissing,
  };
}

