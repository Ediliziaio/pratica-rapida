import { describe, expect, it } from "vitest";
import { createAcquisitionArtifact } from "./aprAcquisitionLevelObservation";
import { runEconomicVertical } from "./aprEconomicVertical";
import { buildFiveLevelCaseMatrix, matrixProjection } from "./aprFiveLevelCaseMatrix";
import { evaluateFiveLevelMatrixCutoverGate } from "./aprFiveLevelMatrixCutoverGate";
import { doubleReplayFiveLevelMatrixBaseline, type AprFiveLevelMatrixBaselineCase } from "./aprFiveLevelCaseMatrixReplay";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { mapBusinessDecisionArtifactToEnea } from "./aprEneaPureMapper";

const HASH = "d".repeat(64);
const locator = { sourceId: "invoice", pageNumber: 1, contentSha256: HASH, excerptSha256: HASH };

function baseline(): AprFiveLevelMatrixBaselineCase[] {
  const customerKey = "matrix-baseline";
  const practiceId = "practice-matrix-baseline";
  const vertical = runEconomicVertical({
    customerKey, practiceId, sourceFingerprint: canonicalSha256("matrix-baseline"), replacements: [], bankTransfers: [],
    invoices: [{ sourceId: "invoice", supplierId: "supplier", supplierName: null, documentNumber: "1", documentDate: "2026-01-01", kind: "invoice", taxableAmount: 100, vatAmount: 10, grossTotal: 110, referencedAdvanceIds: [], interventionGrossAmount: 110, extractionConfidence: "certain", extractionIssues: [], internalAdjustmentNote: null, explicitDeductibleLines: [], lineItems: [], locator }],
  });
  const input = {
    acquisitionArtifact: createAcquisitionArtifact({
      customerKey,
      practiceId,
      documents: [{ documentId: "invoice", pages: [{ pageId: "invoice:1", pageNumber: 1, contentSha256: HASH, acquisitionMethod: "text_extraction", outcome: "complete" }] }],
    }),
    factsArtifacts: [vertical.factsArtifact],
    decisionArtifacts: [vertical.decisionsArtifact],
    mappingArtifacts: [mapBusinessDecisionArtifactToEnea(vertical.decisionsArtifact)],
  };
  const expected = matrixProjection(buildFiveLevelCaseMatrix(input));
  return [{ caseId: "economic-complete", input, expected }];
}

describe("APR Slice 5 matrix baseline replay", () => {
  it("ripete il baseline senza differenze e mantiene il gate 8 NOT_RUN", () => {
    const result = doubleReplayFiveLevelMatrixBaseline(baseline());
    expect(result.status).toBe("PASS");
    expect(result.first).toMatchObject({ status: "PASS", caseCount: 1, unchanged: 1, differenceCount: 0, regressionCount: 0, differences: [] });
    expect(result.first.replayFingerprint).toBe(result.second.replayFingerprint);
    expect(evaluateFiveLevelMatrixCutoverGate({
      positiveTest: { status: "PASS", evidenceRef: "aprFiveLevelCaseMatrix.test.ts" },
      negativeTest: { status: "PASS", evidenceRef: "aprFiveLevelCaseMatrix.test.ts" },
      toleranceBoundaryTest: { status: "NOT_APPLICABLE", evidenceRef: "observation-only aggregation applies no tolerance" },
      deterministicDoubleReplay: { status: result.status, firstFingerprint: result.first.replayFingerprint, secondFingerprint: result.second.replayFingerprint },
      perCaseBaselineComparison: { status: result.first.status, caseCount: result.first.caseCount, differenceCount: result.first.differenceCount, reportFingerprint: result.first.reportFingerprint },
      noCorrectedCaseRegression: { status: result.first.regressionCount === 0 ? "PASS" : "FAIL", regressionCount: result.first.regressionCount },
      differencesExplainedAndApproved: { status: result.first.differenceCount === 0 ? "PASS" : "FAIL", unexplainedCount: result.first.differenceCount, approvalRef: "none-required" },
      monotonicGate: { status: "NOT_RUN", certificateId: null },
    })).toMatchObject({ status: "BLOCKED", cutoverAllowed: false, failedChecks: ["8_monotonic_gate"] });
  });

  it("conta ogni differenza come regressione senza classificazioni permissive", () => {
    const cases = baseline();
    cases[0] = { ...cases[0], expected: { ...cases[0].expected, status: "blocked" } };
    const result = doubleReplayFiveLevelMatrixBaseline(cases);
    expect(result.first).toMatchObject({ status: "FAIL", differenceCount: 1, regressionCount: 1 });
  });
});
