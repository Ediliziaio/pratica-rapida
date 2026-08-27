import {
  verifyBusinessDecisionsArtifact,
  verifyCanonicalFactsArtifact,
  type AprBusinessDecisionsArtifact,
  type AprCanonicalFactsArtifact,
} from "./aprLevelSeparationContracts";
import { verifyL1AcquisitionObservation, type AprL1AcquisitionObservation } from "./aprAcquisitionLevelObservation";
import { APR_ENEA_PURE_MAPPER_VERSION, type AprEneaMappingArtifact } from "./aprEneaPureMapper";
import {
  canonicalSha256,
  envelopeImmutableArtifact,
  verifyImmutableArtifactEnvelope,
  type AprImmutableArtifactEnvelope,
} from "./aprMonotonicArtifacts";

export const APR_FIVE_LEVEL_CASE_MATRIX_VERSION = "apr-five-level-case-matrix-v1" as const;

export type AprMatrixLevelId = "L1" | "L2" | "L3" | "L4" | "L5";
export type AprMatrixLevelStatus = "completed" | "blocked" | "not_applicable";

export interface AprMatrixLevelObservation {
  level: AprMatrixLevelId;
  status: AprMatrixLevelStatus;
  artifactIds: readonly string[];
  blockerCodes: readonly string[];
}

export interface AprFiveLevelCaseMatrixPayload {
  schemaVersion: typeof APR_FIVE_LEVEL_CASE_MATRIX_VERSION;
  mode: "parallel_observation_only";
  customerKey: string;
  practiceId: string;
  status: "complete" | "blocked" | "inconsistent";
  levels: readonly AprMatrixLevelObservation[];
  matrixBlockers: readonly string[];
  operationalAuthority: false;
}

export type AprFiveLevelCaseMatrixArtifact = AprImmutableArtifactEnvelope<AprFiveLevelCaseMatrixPayload>;

export interface AprFiveLevelCaseMatrixInput {
  acquisitionArtifact: AprL1AcquisitionObservation;
  factsArtifacts: readonly AprCanonicalFactsArtifact[];
  decisionArtifacts: readonly AprBusinessDecisionsArtifact[];
  mappingArtifacts: readonly AprEneaMappingArtifact[];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function level(
  levelId: AprMatrixLevelId,
  status: AprMatrixLevelStatus,
  artifactIds: readonly string[],
  blockerCodes: readonly string[],
): AprMatrixLevelObservation {
  return deepFreeze({ level: levelId, status, artifactIds: uniqueSorted(artifactIds), blockerCodes: uniqueSorted(blockerCodes) });
}

function sameCase(customerKey: string, practiceId: string, candidateCustomerKey: string, candidatePracticeId: string) {
  return customerKey === candidateCustomerKey && practiceId === candidatePracticeId;
}

function verifyMappingArtifact(artifact: AprEneaMappingArtifact) {
  return verifyImmutableArtifactEnvelope(artifact)
    && artifact.payload.schemaVersion === APR_ENEA_PURE_MAPPER_VERSION
    && artifact.payload.mode === "parallel_observation_only"
    && artifact.payload.operationalAuthority === false;
}

/**
 * Vista osservativa L1-L5. Non invoca alcun livello: aggrega esclusivamente
 * artefatti gia prodotti. L5 e intenzionalmente non eseguito in questa slice.
 */
export function buildFiveLevelCaseMatrix(input: AprFiveLevelCaseMatrixInput): AprFiveLevelCaseMatrixArtifact {
  if (!verifyL1AcquisitionObservation(input.acquisitionArtifact)) throw new Error("apr_matrix_l1_artifact_invalid");
  const { customerKey, practiceId } = input.acquisitionArtifact;
  const matrixBlockers: string[] = [];

  const l1 = level("L1", input.acquisitionArtifact.status, [input.acquisitionArtifact.artifactId], input.acquisitionArtifact.blockerCodes);

  const validFacts = input.factsArtifacts.filter((artifact) => verifyCanonicalFactsArtifact(artifact)
    && sameCase(customerKey, practiceId, artifact.payload.customerKey, artifact.payload.practiceId));
  const l2Invalid = validFacts.length !== input.factsArtifacts.length;
  if (l2Invalid) matrixBlockers.push("apr_matrix_inconsistent_l2_invalid_or_foreign_artifact");
  const l2Missing = input.factsArtifacts.length === 0;
  if (l1.status === "completed" && l2Missing) matrixBlockers.push("apr_matrix_inconsistent_l1_completed_l2_missing");
  const l2 = l1.status === "blocked" && l2Missing
    ? level("L2", "not_applicable", [], [])
    : level("L2", l2Invalid || l2Missing ? "blocked" : "completed", input.factsArtifacts.map((artifact) => artifact.artifactId), l2Invalid ? ["apr_matrix_l2_artifact_invalid"] : l2Missing ? ["apr_matrix_l2_artifact_missing"] : []);

  const factsById = new Map(validFacts.map((artifact) => [artifact.artifactId, artifact]));
  const validDecisions = input.decisionArtifacts.filter((artifact) => {
    const facts = factsById.get(artifact.payload.factsArtifactId);
    return Boolean(facts) && verifyBusinessDecisionsArtifact(artifact, facts!);
  });
  const l3Invalid = validDecisions.length !== input.decisionArtifacts.length;
  const l3Missing = input.decisionArtifacts.length === 0;
  if (l3Invalid) matrixBlockers.push("apr_matrix_inconsistent_l3_invalid_or_unbound_artifact");
  if (l2.status === "completed" && l3Missing) matrixBlockers.push("apr_matrix_inconsistent_l2_completed_l3_missing");
  const l3DecisionBlockers = validDecisions.flatMap((artifact) => artifact.payload.decisions
    .filter((decision) => decision.status !== "resolved")
    .map((decision) => decision.blockerCode ?? `apr_matrix_l3_blocker_missing:${decision.field}`));
  const l3 = l2.status !== "completed" && l3Missing
    ? level("L3", "not_applicable", [], [])
    : level("L3", l3Invalid || l3Missing || l3DecisionBlockers.length ? "blocked" : "completed", input.decisionArtifacts.map((artifact) => artifact.artifactId), [
      ...(l3Invalid ? ["apr_matrix_l3_artifact_invalid"] : []),
      ...(l3Missing ? ["apr_matrix_l3_artifact_missing"] : []),
      ...l3DecisionBlockers,
    ]);

  const decisionIds = new Set(validDecisions.map((artifact) => artifact.artifactId));
  const validMappings = input.mappingArtifacts.filter((artifact) => verifyMappingArtifact(artifact)
    && sameCase(customerKey, practiceId, artifact.payload.customerKey, artifact.payload.practiceId)
    && decisionIds.has(artifact.payload.sourceDecisionArtifactId));
  const l4Invalid = validMappings.length !== input.mappingArtifacts.length;
  const l4Missing = input.mappingArtifacts.length === 0;
  if (l4Invalid) matrixBlockers.push("apr_matrix_inconsistent_l4_invalid_or_unbound_artifact");
  const l4MappingBlockers = validMappings.flatMap((artifact) => artifact.payload.blockers);
  const l4HasMapped = validMappings.some((artifact) => artifact.payload.status === "mapped");
  const l4HasBlocked = validMappings.some((artifact) => artifact.payload.status === "blocked");
  if (l3.status === "completed" && l4Missing) matrixBlockers.push("apr_matrix_inconsistent_l3_completed_l4_missing");
  if (l3.status === "completed" && l4HasBlocked) matrixBlockers.push("apr_matrix_inconsistent_l3_completed_l4_blocked");
  if (l3.status === "blocked" && l4HasMapped) matrixBlockers.push("apr_matrix_inconsistent_l3_blocked_l4_mapped");
  if (l4HasMapped && l4HasBlocked) matrixBlockers.push("apr_matrix_inconsistent_l4_mixed_status");
  const l4 = l3.status === "blocked" && l4Missing
    ? level("L4", "not_applicable", [], [])
    : level("L4", l4Invalid || l4Missing || l4HasBlocked ? "blocked" : "completed", input.mappingArtifacts.map((artifact) => artifact.artifactId), [
      ...(l4Invalid ? ["apr_matrix_l4_artifact_invalid"] : []),
      ...(l4Missing ? ["apr_matrix_l4_artifact_missing"] : []),
      ...l4MappingBlockers,
    ]);

  const l5 = level("L5", "not_applicable", [], []);
  const levels = deepFreeze([l1, l2, l3, l4, l5]);
  const uniqueMatrixBlockers = uniqueSorted(matrixBlockers);
  const payload: AprFiveLevelCaseMatrixPayload = {
    schemaVersion: APR_FIVE_LEVEL_CASE_MATRIX_VERSION,
    mode: "parallel_observation_only",
    customerKey,
    practiceId,
    status: uniqueMatrixBlockers.length ? "inconsistent" : levels.some((item) => item.status === "blocked") ? "blocked" : "complete",
    levels,
    matrixBlockers: uniqueMatrixBlockers,
    operationalAuthority: false,
  };
  return deepFreeze(envelopeImmutableArtifact(payload));
}

export function matrixProjection(artifact: AprFiveLevelCaseMatrixArtifact) {
  return deepFreeze({
    customerKey: artifact.payload.customerKey,
    practiceId: artifact.payload.practiceId,
    status: artifact.payload.status,
    levels: artifact.payload.levels,
    matrixBlockers: artifact.payload.matrixBlockers,
    projectionFingerprint: canonicalSha256({ levels: artifact.payload.levels, matrixBlockers: artifact.payload.matrixBlockers }),
  });
}
