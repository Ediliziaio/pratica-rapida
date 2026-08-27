import { describe, expect, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { runEconomicVertical } from "./aprEconomicVertical";
import { evaluateEneaMapperCutoverGate } from "./aprEneaMapperCutoverGate";
import { doubleReplayEneaMapperBaseline, type AprEneaMapperBaselineCase } from "./aprEneaMapperReplay";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { runProductVertical } from "./aprProductVertical";

const HASH = "b".repeat(64);
const locator = (sourceId: string) => ({ sourceId, pageNumber: 1, contentSha256: HASH, excerptSha256: HASH });

function baseline(): AprEneaMapperBaselineCase[] {
  const economic = runEconomicVertical({
    customerKey: "economic-baseline", practiceId: "economic-baseline", sourceFingerprint: canonicalSha256("economic-baseline"), replacements: [], bankTransfers: [],
    invoices: [{ sourceId: "invoice", supplierId: "supplier", supplierName: null, documentNumber: "1", documentDate: "2026-01-01", kind: "invoice", taxableAmount: 100, vatAmount: 10, grossTotal: 110, referencedAdvanceIds: [], interventionGrossAmount: 110, extractionConfidence: "certain", extractionIssues: [], internalAdjustmentNote: null, explicitDeductibleLines: [], lineItems: [], locator: locator("invoice") }],
  });
  const screening = runProductVertical({
    customerKey: "screening-baseline", practiceId: "screening-baseline", sourceFingerprint: canonicalSha256("screening-baseline"), module: "screening",
    screeningObservations: [{ observationId: "line", sequence: 0, sourceId: "invoice", description: "Tenda", declaredQuantity: 1, originalWidth: 300, originalHeight: 200, explicitUnit: "cm", normalizedWidthMm: 3000, normalizedHeightMm: 2000, explicitSurfaceM2: 6, observedTransmittanceWm2K: null, locator: locator("invoice"), extractionMethod: "pdf_text", extractionRuleId: USER_AUTHORIZED_RULE_IDS.technicalProductCardinality }],
    screeningFormObservations: [{ sequence: 0, sourceId: "form", declaredType: "tenda_da_sole", locator: locator("form") }],
  });
  const infissi = runProductVertical({
    customerKey: "infissi-baseline", practiceId: "infissi-baseline", sourceFingerprint: canonicalSha256("infissi-baseline"), module: "infissi",
    infissiSources: [{ sourceId: "invoice", kind: "invoice", text: "FATTURA INFISSI 1 da 1200 x 1400" }],
  });
  return [
    { caseId: "economic", decisionsArtifact: economic.decisionsArtifact, expected: { status: "mapped", blockers: [], portalFields: [{ fieldId: "calcolo.spesa_ammissibile_lorda_iva_inclusa", value: 110 }] } },
    { caseId: "screening", decisionsArtifact: screening.decisionsArtifact, expected: { status: "mapped", blockers: [], portalFields: [{ fieldId: "schermature.numero", value: 1 }, { fieldId: "schermature.0.dimensioni", value: "3000 × 2000 mm" }, { fieldId: "schermature.0.superficie", value: 6 }] } },
    { caseId: "infissi", decisionsArtifact: infissi.decisionsArtifact, expected: { status: "mapped", blockers: [], portalFields: [{ fieldId: "infissi.numero", value: 1 }, { fieldId: "infissi.0.superficie", value: 1.7 }, { fieldId: "infissi.0.trasmittanza_nuovo", value: 1.3 }] } },
  ];
}

describe("APR Slice 4 ENEA mapper baseline replay", () => {
  it("riproduce due volte lo stesso baseline economico, screening e infissi", () => {
    const result = doubleReplayEneaMapperBaseline(baseline());
    expect(result.status).toBe("PASS");
    expect(result.first).toMatchObject({ status: "PASS", caseCount: 3, unchanged: 3, differenceCount: 0, regressionCount: 0, differences: [] });
    expect(result.first.replayFingerprint).toBe(result.second.replayFingerprint);
    expect(evaluateEneaMapperCutoverGate({
      positiveTest: { status: "PASS", evidenceRef: "aprEneaPureMapper.test.ts" },
      negativeTest: { status: "PASS", evidenceRef: "aprEneaPureMapper.test.ts" },
      toleranceBoundaryTest: { status: "NOT_APPLICABLE", evidenceRef: "L4 copies decided values without tolerance" },
      deterministicDoubleReplay: { status: result.status, firstFingerprint: result.first.replayFingerprint, secondFingerprint: result.second.replayFingerprint },
      perCaseBaselineComparison: { status: result.first.status, caseCount: result.first.caseCount, differenceCount: result.first.differenceCount, reportFingerprint: result.first.reportFingerprint },
      noCorrectedCaseRegression: { status: result.first.regressionCount === 0 ? "PASS" : "FAIL", regressionCount: result.first.regressionCount },
      differencesExplainedAndApproved: { status: result.first.differenceCount === 0 ? "PASS" : "FAIL", unexplainedCount: result.first.differenceCount, approvalRef: "none-required" },
      monotonicGate: { status: "NOT_RUN", certificateId: null },
    })).toMatchObject({ status: "BLOCKED", cutoverAllowed: false, failedChecks: ["8_monotonic_gate"] });
  });

  it("rende visibile una singola differenza come regressione", () => {
    const cases = baseline();
    cases[0] = { ...cases[0], expected: { ...cases[0].expected, portalFields: [{ fieldId: "calcolo.spesa_ammissibile_lorda_iva_inclusa", value: 999 }] } };
    const result = doubleReplayEneaMapperBaseline(cases);
    expect(result.first).toMatchObject({ status: "FAIL", differenceCount: 1, regressionCount: 1 });
    expect(result.first.differences[0].caseId).toBe("economic");
  });
});
