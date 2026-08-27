import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { buildFiveLevelCaseMatrix, matrixProjection, type AprFiveLevelCaseMatrixInput } from "./aprFiveLevelCaseMatrix";

export const APR_FIVE_LEVEL_MATRIX_REPLAY_VERSION = "apr-five-level-matrix-replay-v1" as const;

export interface AprFiveLevelMatrixBaselineCase {
  caseId: string;
  input: AprFiveLevelCaseMatrixInput;
  expected: ReturnType<typeof matrixProjection>;
}

export function replayFiveLevelMatrixBaseline(cases: readonly AprFiveLevelMatrixBaselineCase[]) {
  const identities = new Set<string>();
  const rows = cases.map((item) => {
    if (!item.caseId.trim() || identities.has(item.caseId)) throw new Error(`apr_matrix_replay_case_identity_invalid:${item.caseId}`);
    identities.add(item.caseId);
    const actual = matrixProjection(buildFiveLevelCaseMatrix(item.input));
    return { caseId: item.caseId, expected: item.expected, actual, identical: canonicalSha256(item.expected) === canonicalSha256(actual) };
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  const differences = rows.filter((row) => !row.identical).map(({ caseId, expected, actual }) => ({ caseId, expected, actual }));
  return Object.freeze({
    schemaVersion: APR_FIVE_LEVEL_MATRIX_REPLAY_VERSION,
    caseCount: rows.length,
    unchanged: rows.length - differences.length,
    differenceCount: differences.length,
    regressionCount: differences.length,
    differences: Object.freeze(differences),
    replayFingerprint: canonicalSha256(rows),
    reportFingerprint: canonicalSha256({ caseCount: rows.length, differences }),
    status: differences.length ? "FAIL" as const : "PASS" as const,
  });
}

export function doubleReplayFiveLevelMatrixBaseline(cases: readonly AprFiveLevelMatrixBaselineCase[]) {
  const first = replayFiveLevelMatrixBaseline(cases);
  const second = replayFiveLevelMatrixBaseline(cases);
  return Object.freeze({ status: first.replayFingerprint === second.replayFingerprint ? "PASS" as const : "FAIL" as const, first, second });
}
