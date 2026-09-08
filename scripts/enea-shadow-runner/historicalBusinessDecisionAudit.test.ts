import { describe, expect, it } from "vitest";
import { APR_DECLARED_BUSINESS_DECISIONS } from "../../src/features/enea-shadow-crm/businessDecisionLedger";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { assertHistoricalBusinessDecisionAudit, buildHistoricalBusinessDecisionAudit } from "./historicalBusinessDecisionAudit";

const sourceInventory = {
  sessionsRoot: "/readonly/sessions",
  eligibleSessionFiles: 1,
  uniqueDirectUserMessages: 1,
  availableFrom: "2026-08-12T00:00:00.000Z",
  availableTo: "2026-09-05T00:00:00.000Z",
  sourceCorpusFingerprint: "a".repeat(64),
  additionalSourceFiles: [],
  additionalSourceMessageCount: 0,
  exactSourceReferences: [],
  messageHashesByDate: Object.fromEntries([...new Set(APR_DECLARED_BUSINESS_DECISIONS.map((item) => item.source.receivedAt).filter((item) => item !== "undocumented"))].map((date) => [date, ["b".repeat(64)]])),
};

describe("recupero storico attivo delle decisioni di business", () => {
  it("distingue regole gia attive e regole rese attive nel bundle corrente", () => {
    const baselineBundleText = APR_DECLARED_BUSINESS_DECISIONS.filter((item) => !item.ruleIds.some((ruleId) => ruleId.includes("technical-autonomy") || ruleId.includes("structured-residual"))).flatMap((item) => item.ruleIds).join("\n");
    const currentBundleText = APR_DECLARED_BUSINESS_DECISIONS.flatMap((item) => item.ruleIds).join("\n");
    const report = buildHistoricalBusinessDecisionAudit({ sourceInventory, provedMatrixKeys: new Set(APR_RULE_TEST_MATRIX.map((item) => item.key)), deploymentVerified: true, baselineBundleText, currentBundleText });
    expect(report.newlyActivatedNowCount).toBe(2);
    expect(report.unresolvedDocumentedDecisionCount).toBe(0);
    expect(() => assertHistoricalBusinessDecisionAudit(report)).not.toThrow();
  });

  it("fallisce chiuso se una decisione documentata non ha prova, fonte o bundle", () => {
    const report = buildHistoricalBusinessDecisionAudit({ sourceInventory: { ...sourceInventory, messageHashesByDate: {} }, provedMatrixKeys: new Set(), deploymentVerified: false, baselineBundleText: "", currentBundleText: "" });
    expect(report.unresolvedDocumentedDecisionCount).toBeGreaterThan(0);
    expect(() => assertHistoricalBusinessDecisionAudit(report)).toThrow("apr_historical_business_decision_audit_incomplete");
  });
});
