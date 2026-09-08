import { createHash } from "node:crypto";

export const APR_L5_HISTORICAL_REGRESSION_GATE_VERSION = "apr-l5-historical-regression-gate-v1" as const;

export interface AprL5HistoricalBaselineCase {
  fixtureKey: string;
  historicallyComplete: boolean;
  expectedPageCount: number;
}

export interface AprL5HistoricalCandidateResult {
  fixtureKey: string;
  round: 1 | 2 | 3;
  state: "saved" | "operator_required" | "technical_block" | "inconsistent";
  completedPageCount: number;
  expectedPageCount: number;
  persistenceVerified: boolean;
  causeCode: string | null;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function evaluateAprL5HistoricalRegressionGate(input: {
  baseline: readonly AprL5HistoricalBaselineCase[];
  candidate: readonly AprL5HistoricalCandidateResult[];
}) {
  const baselineKeys = [...new Set(input.baseline.map((item) => item.fixtureKey))].sort();
  const candidateKeys = [...new Set(input.candidate.map((item) => item.fixtureKey))].sort();
  const regressions: Array<{ fixtureKey: string; round: number; code: string }> = [];
  if (baselineKeys.length !== input.baseline.length || JSON.stringify(baselineKeys) !== JSON.stringify(candidateKeys)) {
    regressions.push({ fixtureKey: "__corpus__", round: 0, code: "l5_regression_corpus_mismatch" });
  }
  for (const before of input.baseline) {
    const rounds = input.candidate.filter((item) => item.fixtureKey === before.fixtureKey).sort((left, right) => left.round - right.round);
    if (rounds.length !== 3 || rounds.some((item, index) => item.round !== index + 1)) {
      regressions.push({ fixtureKey: before.fixtureKey, round: 0, code: "l5_regression_three_rounds_missing" });
      continue;
    }
    if (rounds.some((item) => item.expectedPageCount !== before.expectedPageCount)) {
      regressions.push({ fixtureKey: before.fixtureKey, round: 0, code: "l5_regression_page_contract_changed" });
    }
    if (before.historicallyComplete) {
      for (const result of rounds) if (result.state !== "saved" || result.completedPageCount !== before.expectedPageCount || !result.persistenceVerified) {
        regressions.push({ fixtureKey: before.fixtureKey, round: result.round, code: "l5_historically_complete_case_regressed" });
      }
    }
  }
  return Object.freeze({
    version: APR_L5_HISTORICAL_REGRESSION_GATE_VERSION,
    status: regressions.length ? "FAIL" as const : "PASS" as const,
    baselineCaseCount: input.baseline.length,
    candidateObservationCount: input.candidate.length,
    regressions: Object.freeze(regressions),
    evidenceFingerprint: fingerprint(input),
  });
}
