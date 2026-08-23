import { createHash } from "node:crypto";

export const APR_MONOTONIC_ARTIFACTS_VERSION = "apr-monotonic-artifacts-v1" as const;

export type AprPublicCaseStatus =
  | "READY"
  | "COMPLETED"
  | "OPERATOR_REQUIRED"
  | "TECHNICAL_BLOCK"
  | "IN_PROGRESS"
  | "DEFERRED"
  | "INCONSISTENT";

export type AprNormalizedObservationStatus =
  | "PASS"
  | "BLOCKED"
  | "COMPLETED"
  | "IN_PROGRESS"
  | "DEFERRED"
  | "NOT_APPLICABLE"
  | "MISSING"
  | "INCONSISTENT";

export type AprPipelineStage =
  | "COMMON_PREFLIGHT"
  | "PRODUCT_GATE"
  | "DEEP_REVIEW"
  | "EXECUTION"
  | "SERVER_VERIFICATION";

export type AprCaseObservationSource =
  | "preflight_common"
  | "product_gate"
  | "deep_review"
  | "execution"
  | "report_blockers"
  | "checkpoint";

export interface AprCaseStatusObservation {
  source: AprCaseObservationSource;
  stage: AprPipelineStage;
  customerKey: string;
  runId: string;
  status: AprNormalizedObservationStatus;
  blockerCodes: readonly string[];
  classification: "BUSINESS" | "OPERATOR" | "TECHNICAL" | "NONE";
  observedAt: string;
  sourceFingerprint: string;
}

export interface AprInputCorpusCaseFingerprint {
  customerKey: string;
  dossierSha256: string;
  originalDocumentSetSha256: string;
}

export interface AprInputCorpusFingerprint {
  corpusVersion: string;
  caseCount: 40;
  customerKeysSha256: string;
  sourceSetSha256: string;
  perCaseSources: readonly AprInputCorpusCaseFingerprint[];
}

export interface AprCaseOutputFingerprint {
  customerKey: string;
  publicStatus: AprPublicCaseStatus;
  payloadSha256: string | null;
  blockerSetSha256: string;
  appliedRuleSetSha256: string;
}

export interface AprRuleTestEvidenceReference {
  ruleId: string;
  positiveEvidenceId: string;
  negativeEvidenceId: string;
}

export interface AprStagedBundleHash {
  role: "supervisor" | "worker" | "watchdog";
  stagedPath: string;
  stagedSha256: string;
}

export interface AprMonotonicPreDeployCertificatePayload {
  schemaVersion: "apr-monotonic-predeploy-certificate-v1";
  issuedAt: string;
  gitCommit: string;
  gitTree: string;
  runtimeRevision: string;
  inputCorpusFingerprint: AprInputCorpusFingerprint;
  baselineId: string;
  newRuleIds: readonly string[];
  ruleTestEvidence: readonly AprRuleTestEvidenceReference[];
  replayDifferentialReportId: string;
  stagedBundleHashes: readonly AprStagedBundleHash[];
  status: "PASS" | "FAIL";
  rejectionReasons: readonly string[];
}

export interface AprImmutableArtifactEnvelope<TPayload> {
  artifactId: string;
  payload: TPayload;
}

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson };

function normalizeCanonicalJson(value: unknown, seen: Set<object>): CanonicalJson {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("apr_canonical_json_non_finite_number");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") throw new Error(`apr_canonical_json_unsupported_type:${typeof value}`);
  if (seen.has(value)) throw new Error("apr_canonical_json_cycle");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => normalizeCanonicalJson(item, seen));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("apr_canonical_json_non_plain_object");
    const source = value as Record<string, unknown>;
    const output: Record<string, CanonicalJson> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) throw new Error(`apr_canonical_json_undefined:${key}`);
      output[key] = normalizeCanonicalJson(source[key], seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(normalizeCanonicalJson(value, new Set<object>()));
}

export function canonicalSha256(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function envelopeImmutableArtifact<TPayload>(payload: TPayload): AprImmutableArtifactEnvelope<TPayload> {
  return { artifactId: canonicalSha256(payload), payload };
}

export function verifyImmutableArtifactEnvelope<TPayload>(envelope: AprImmutableArtifactEnvelope<TPayload>) {
  return envelope.artifactId === canonicalSha256(envelope.payload);
}
