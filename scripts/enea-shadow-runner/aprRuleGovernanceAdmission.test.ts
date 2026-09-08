import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APR_DECLARED_BUSINESS_DECISIONS } from "../../src/features/enea-shadow-crm/businessDecisionLedger";
import { APR_RULE_SOURCE_FINGERPRINT } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS, buildAprRuleGovernanceAttestation, verifyAprRuleGovernanceAdmission } from "./aprRuleGovernanceAdmission";
import { APR_HISTORICAL_BUSINESS_DECISION_AUDIT_VERSION } from "./historicalBusinessDecisionAudit";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-rule-governance-")); roots.push(root);
  for (const name of ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"]) writeFileSync(path.join(root, name), `bundle:${name}`);
  const report = path.join(root, "audit.json"); writeFileSync(report, JSON.stringify({ version: APR_HISTORICAL_BUSINESS_DECISION_AUDIT_VERSION, status: "completed", unresolvedDocumentedDecisionCount: 0, ruleSourceFingerprint: APR_RULE_SOURCE_FINGERPRINT, declaredDecisionCount: APR_DECLARED_BUSINESS_DECISIONS.length }));
  const attestation = buildAprRuleGovernanceAttestation({ bundleDirectory: root, historicalAuditReport: report, attestedAt: new Date("2026-09-05T11:00:00.000Z") });
  const attestationPath = path.join(root, "apr-rule-governance-attestation.json"); writeFileSync(attestationPath, JSON.stringify(attestation));
  return { root, report, attestationPath };
}

function authorizedGapFixture(extraDecisionIds: string[] = []) {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-rule-governance-gap-")); roots.push(root);
  for (const name of ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"]) writeFileSync(path.join(root, name), `bundle:${name}`);
  const unresolvedDecisionIds = [...APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS, ...extraDecisionIds];
  const report = path.join(root, "audit.json");
  writeFileSync(report, JSON.stringify({
    version: APR_HISTORICAL_BUSINESS_DECISION_AUDIT_VERSION,
    status: "incomplete",
    unresolvedDocumentedDecisionCount: unresolvedDecisionIds.length,
    ruleSourceFingerprint: APR_RULE_SOURCE_FINGERPRINT,
    declaredDecisionCount: APR_DECLARED_BUSINESS_DECISIONS.length,
    decisions: unresolvedDecisionIds.map((decisionId) => ({ decisionId: `decision:${decisionId}`, recoveryStatus: "unresolved_documented" })),
  }));
  return { root, report };
}

describe("admission APR vincolata a bundle registro matrice e decisioni", () => {
  it("ammette il bundle solo con identità completa e audit storico chiuso", () => {
    const value = fixture();
    expect(verifyAprRuleGovernanceAdmission({ executablePath: path.join(value.root, "apr-enea-worker.mjs"), attestationPath: value.attestationPath })).toMatchObject({ status: "admitted", failures: [] });
  });

  it("fallisce chiuso con attestazione assente o bundle modificato", () => {
    const value = fixture();
    expect(verifyAprRuleGovernanceAdmission({ executablePath: path.join(value.root, "apr-enea-worker.mjs"), attestationPath: path.join(value.root, "missing.json") }).status).toBe("technical_block");
    writeFileSync(path.join(value.root, "apr-enea-worker.mjs"), "tampered");
    expect(verifyAprRuleGovernanceAdmission({ executablePath: path.join(value.root, "apr-enea-worker.mjs"), attestationPath: value.attestationPath }).failures).toContain("running_bundle_hash_mismatch");
  });

  it("ammette soltanto i quattro gap storici esplicitamente autorizzati", () => {
    const value = authorizedGapFixture();
    expect(() => buildAprRuleGovernanceAttestation({ bundleDirectory: value.root, historicalAuditReport: value.report })).toThrow("apr_rule_governance_historical_audit_incomplete");
    const attestation = buildAprRuleGovernanceAttestation({ bundleDirectory: value.root, historicalAuditReport: value.report, allowAuthorizedHistoricalGap: true });
    const attestationPath = path.join(value.root, "apr-rule-governance-attestation.json"); writeFileSync(attestationPath, JSON.stringify(attestation));
    expect(attestation).toMatchObject({ status: "certified_deployed_with_authorized_historical_gap", historicalAudit: { status: "authorized_historical_gap", unresolvedDocumentedDecisionCount: 4 } });
    expect(verifyAprRuleGovernanceAdmission({ executablePath: path.join(value.root, "apr-enea-worker.mjs"), attestationPath })).toMatchObject({ status: "admitted", failures: [] });
  });

  it("rifiuta un quinto gap o la sostituzione di uno dei quattro ID autorizzati", () => {
    const fifth = authorizedGapFixture(["user-2026-09-08-unexpected-gap-v1"]);
    expect(() => buildAprRuleGovernanceAttestation({ bundleDirectory: fifth.root, historicalAuditReport: fifth.report, allowAuthorizedHistoricalGap: true })).toThrow("apr_rule_governance_historical_audit_incomplete");
    const value = authorizedGapFixture();
    const attestation = buildAprRuleGovernanceAttestation({ bundleDirectory: value.root, historicalAuditReport: value.report, allowAuthorizedHistoricalGap: true });
    if (attestation.historicalAudit.status !== "authorized_historical_gap") throw new Error("fixture_authorized_gap_expected");
    attestation.historicalAudit.unresolvedDecisionIds[0] = "user-2026-09-08-substituted-gap-v1";
    const attestationPath = path.join(value.root, "apr-rule-governance-attestation.json"); writeFileSync(attestationPath, JSON.stringify(attestation));
    expect(verifyAprRuleGovernanceAdmission({ executablePath: path.join(value.root, "apr-enea-worker.mjs"), attestationPath }).failures).toContain("historical_audit_incomplete");
  });
});
