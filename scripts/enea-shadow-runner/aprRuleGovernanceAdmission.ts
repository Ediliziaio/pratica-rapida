import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { APR_BUSINESS_DECISION_LEDGER_FINGERPRINT, APR_BUSINESS_DECISION_LEDGER_VERSION, APR_DECLARED_BUSINESS_DECISIONS } from "../../src/features/enea-shadow-crm/businessDecisionLedger";
import { ENEA_OPERATIONAL_REGISTRY_VERSION } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { APR_RULE_SOURCE_FINGERPRINT, APR_RULE_TEST_MATRIX, APR_RULE_TEST_MATRIX_VERSION } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { APR_HISTORICAL_BUSINESS_DECISION_AUDIT_VERSION } from "./historicalBusinessDecisionAudit";

function sha256(value: Buffer | string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export const APR_RULE_GOVERNANCE_ATTESTATION_VERSION = "apr-rule-governance-attestation-v2" as const;
export const APR_RULE_GOVERNANCE_SIDECAR = "apr-rule-governance-attestation.json" as const;

export const APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS = Object.freeze([
  "user-2026-08-06-existing-plant-authoritative-mapping-v1",
  "user-2026-08-06-intervention-authoritative-sources-and-defaults-v1",
  "user-2026-08-06-portal-intermediary-physical-beneficiary-v1",
  "user-2026-08-06-portal-municipality-controlled-selection-v1",
] as const);
export const APR_AUTHORIZED_HISTORICAL_GAP_AUTHORIZATION_ID = "user-2026-09-08-r98-four-unrecoverable-august-6-decisions-v1" as const;
const APR_AUTHORIZED_HISTORICAL_GAP_AUTHORIZATION_EVIDENCE = "Giuliano authorizes APR r98 to admit exactly the four documented and unrecoverable 2026-08-06 historical source gaps; no other gap is authorized.";
export const APR_AUTHORIZED_HISTORICAL_GAP_AUTHORIZATION_SHA256 = sha256(APR_AUTHORIZED_HISTORICAL_GAP_AUTHORIZATION_EVIDENCE);

type AprRuleGovernanceHistoricalAudit =
  | { status: "completed"; unresolvedDocumentedDecisionCount: 0; reportSha256: string }
  | {
      status: "authorized_historical_gap";
      unresolvedDocumentedDecisionCount: 4;
      unresolvedDecisionIds: string[];
      authorizationId: typeof APR_AUTHORIZED_HISTORICAL_GAP_AUTHORIZATION_ID;
      authorizationEvidenceSha256: string;
      reportSha256: string;
    };

export interface AprRuleGovernanceAttestation {
  version: typeof APR_RULE_GOVERNANCE_ATTESTATION_VERSION;
  status: "certified_deployed" | "certified_deployed_with_authorized_historical_gap";
  attestedAt: string;
  registryVersion: typeof ENEA_OPERATIONAL_REGISTRY_VERSION;
  matrixVersion: typeof APR_RULE_TEST_MATRIX_VERSION;
  ruleSourceFingerprint: string;
  decisionLedgerVersion: typeof APR_BUSINESS_DECISION_LEDGER_VERSION;
  decisionLedgerFingerprint: string;
  activeDecisionCount: number;
  matrixRuleCount: number;
  historicalAudit: AprRuleGovernanceHistoricalAudit;
  bundleSha256: Record<string, string>;
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]);
}

export function expectedAprRuleGovernanceIdentity() {
  return {
    registryVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    matrixVersion: APR_RULE_TEST_MATRIX_VERSION,
    ruleSourceFingerprint: APR_RULE_SOURCE_FINGERPRINT,
    decisionLedgerVersion: APR_BUSINESS_DECISION_LEDGER_VERSION,
    decisionLedgerFingerprint: APR_BUSINESS_DECISION_LEDGER_FINGERPRINT,
    activeDecisionCount: APR_DECLARED_BUSINESS_DECISIONS.filter((item) => item.status !== "superseded").length,
    matrixRuleCount: APR_RULE_TEST_MATRIX.length,
  };
}

export function verifyAprRuleGovernanceAdmission(input: { executablePath: string; attestationPath?: string }) {
  const executablePath = path.resolve(input.executablePath);
  const attestationPath = path.resolve(input.attestationPath ?? path.join(path.dirname(executablePath), APR_RULE_GOVERNANCE_SIDECAR));
  const expected = expectedAprRuleGovernanceIdentity();
  const failures: string[] = [];
  if (!existsSync(executablePath)) failures.push("bundle_missing");
  if (!existsSync(attestationPath)) failures.push("attestation_missing");
  let attestation: AprRuleGovernanceAttestation | null = null;
  if (!failures.length) {
    try { attestation = JSON.parse(readFileSync(attestationPath, "utf8")) as AprRuleGovernanceAttestation; }
    catch { failures.push("attestation_invalid_json"); }
  }
  if (attestation) {
    if (attestation.version !== APR_RULE_GOVERNANCE_ATTESTATION_VERSION || !["certified_deployed", "certified_deployed_with_authorized_historical_gap"].includes(attestation.status)) failures.push("attestation_contract_mismatch");
    for (const [key, value] of Object.entries(expected)) if ((attestation as unknown as Record<string, unknown>)[key] !== value) failures.push(`${key}_mismatch`);
    const audit = attestation.historicalAudit;
    const completedAudit = attestation.status === "certified_deployed"
      && audit?.status === "completed"
      && audit.unresolvedDocumentedDecisionCount === 0;
    const authorizedGapAudit = attestation.status === "certified_deployed_with_authorized_historical_gap"
      && audit?.status === "authorized_historical_gap"
      && audit.unresolvedDocumentedDecisionCount === APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS.length
      && sameStrings(audit.unresolvedDecisionIds ?? [], APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS)
      && audit.authorizationId === APR_AUTHORIZED_HISTORICAL_GAP_AUTHORIZATION_ID
      && audit.authorizationEvidenceSha256 === APR_AUTHORIZED_HISTORICAL_GAP_AUTHORIZATION_SHA256;
    if ((!completedAudit && !authorizedGapAudit) || !/^[a-f0-9]{64}$/.test(audit?.reportSha256 ?? "")) failures.push("historical_audit_incomplete");
    const executableName = path.basename(executablePath);
    const expectedBundleHash = attestation.bundleSha256?.[executableName];
    if (!/^[a-f0-9]{64}$/.test(expectedBundleHash ?? "") || (existsSync(executablePath) && sha256(readFileSync(executablePath)) !== expectedBundleHash)) failures.push("running_bundle_hash_mismatch");
  }
  return { status: failures.length ? "technical_block" as const : "admitted" as const, failures, executablePath, attestationPath, expected, attestation };
}

export function assertAprRuleGovernanceAdmission(input: { executablePath: string; attestationPath?: string }) {
  const result = verifyAprRuleGovernanceAdmission(input);
  if (result.status !== "admitted") throw new Error(`apr_rule_governance_admission_failed:${result.failures.join(",")}`);
  return result;
}

export function buildAprRuleGovernanceAttestation(input: { bundleDirectory: string; historicalAuditReport: string; attestedAt?: Date; allowAuthorizedHistoricalGap?: boolean }): AprRuleGovernanceAttestation {
  const report = path.resolve(input.historicalAuditReport);
  if (!existsSync(report)) throw new Error("apr_rule_governance_historical_audit_missing");
  const parsed = JSON.parse(readFileSync(report, "utf8")) as {
    version?: string;
    status?: string;
    unresolvedDocumentedDecisionCount?: number;
    ruleSourceFingerprint?: string;
    declaredDecisionCount?: number;
    decisions?: Array<{ decisionId?: string; recoveryStatus?: string }>;
  };
  const identityMatches = parsed.version === APR_HISTORICAL_BUSINESS_DECISION_AUDIT_VERSION
    && parsed.ruleSourceFingerprint === APR_RULE_SOURCE_FINGERPRINT
    && parsed.declaredDecisionCount === APR_DECLARED_BUSINESS_DECISIONS.length;
  const unresolvedDecisionIds = (parsed.decisions ?? [])
    .filter((item) => item.recoveryStatus === "unresolved_documented")
    .map((item) => (item.decisionId ?? "").replace(/^decision:/, ""))
    .filter(Boolean);
  const completedAudit = parsed.status === "completed" && parsed.unresolvedDocumentedDecisionCount === 0 && unresolvedDecisionIds.length === 0;
  const authorizedGapAudit = input.allowAuthorizedHistoricalGap === true
    && parsed.status === "incomplete"
    && parsed.unresolvedDocumentedDecisionCount === APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS.length
    && sameStrings(unresolvedDecisionIds, APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS);
  if (!identityMatches || (!completedAudit && !authorizedGapAudit)) throw new Error("apr_rule_governance_historical_audit_incomplete");
  const bundleDirectory = path.resolve(input.bundleDirectory);
  const bundleNames = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"];
  const bundleSha256 = Object.fromEntries(bundleNames.map((name) => {
    const target = path.join(bundleDirectory, name);
    if (!existsSync(target)) throw new Error(`apr_rule_governance_bundle_missing:${name}`);
    return [name, sha256(readFileSync(target))];
  }));
  const historicalAudit: AprRuleGovernanceHistoricalAudit = authorizedGapAudit ? {
    status: "authorized_historical_gap",
    unresolvedDocumentedDecisionCount: 4,
    unresolvedDecisionIds: [...APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS],
    authorizationId: APR_AUTHORIZED_HISTORICAL_GAP_AUTHORIZATION_ID,
    authorizationEvidenceSha256: APR_AUTHORIZED_HISTORICAL_GAP_AUTHORIZATION_SHA256,
    reportSha256: sha256(readFileSync(report)),
  } : {
    status: "completed",
    unresolvedDocumentedDecisionCount: 0,
    reportSha256: sha256(readFileSync(report)),
  };
  return {
    version: APR_RULE_GOVERNANCE_ATTESTATION_VERSION,
    status: authorizedGapAudit ? "certified_deployed_with_authorized_historical_gap" : "certified_deployed",
    attestedAt: (input.attestedAt ?? new Date()).toISOString(),
    ...expectedAprRuleGovernanceIdentity(),
    historicalAudit,
    bundleSha256,
  };
}
