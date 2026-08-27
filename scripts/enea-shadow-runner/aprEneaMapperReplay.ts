import type { AprBusinessDecisionsArtifact } from "./aprLevelSeparationContracts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { mapBusinessDecisionArtifactToEnea, type AprEneaMappedPortalField } from "./aprEneaPureMapper";

export const APR_ENEA_MAPPER_REPLAY_VERSION = "apr-enea-mapper-replay-v1" as const;

export interface AprEneaMapperBaselineCase {
  caseId: string;
  decisionsArtifact: AprBusinessDecisionsArtifact;
  expected: Readonly<{
    status: "mapped" | "blocked";
    portalFields: ReadonlyArray<Pick<AprEneaMappedPortalField, "fieldId" | "value">>;
    blockers: readonly string[];
  }>;
}
function projection(artifact: ReturnType<typeof mapBusinessDecisionArtifactToEnea>) {
  return {
    status: artifact.payload.status,
    portalFields: artifact.payload.portalFields.map(({ fieldId, value }) => ({ fieldId, value })),
    blockers: [...artifact.payload.blockers],
  };
}

export function replayEneaMapperBaseline(cases: readonly AprEneaMapperBaselineCase[]) {
  const seen = new Set<string>();
  const rows = cases.map((item) => {
    if (!item.caseId.trim() || seen.has(item.caseId)) throw new Error(`apr_l4_replay_case_identity_invalid:${item.caseId}`);
    seen.add(item.caseId);
    const actual = projection(mapBusinessDecisionArtifactToEnea(item.decisionsArtifact));
    return {
      caseId: item.caseId,
      expected: item.expected,
      actual,
      identical: canonicalSha256(item.expected) === canonicalSha256(actual),
    };
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  const differences = rows.filter((row) => !row.identical).map(({ caseId, expected, actual }) => ({ caseId, expected, actual }));
  return Object.freeze({
    schemaVersion: APR_ENEA_MAPPER_REPLAY_VERSION,
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

export function doubleReplayEneaMapperBaseline(cases: readonly AprEneaMapperBaselineCase[]) {
  const first = replayEneaMapperBaseline(cases);
  const second = replayEneaMapperBaseline(cases);
  return Object.freeze({
    status: first.replayFingerprint === second.replayFingerprint ? "PASS" as const : "FAIL" as const,
    first,
    second,
  });
}
