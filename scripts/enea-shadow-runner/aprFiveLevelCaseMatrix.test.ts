import { describe, expect, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { APR_L1_ACQUISITION_OBSERVATION_VERSION } from "./aprAcquisitionLevelObservation";
import { runEconomicVertical } from "./aprEconomicVertical";
import { buildFiveLevelCaseMatrix } from "./aprFiveLevelCaseMatrix";
import { createBusinessDecisionsArtifact } from "./aprLevelSeparationContracts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { mapBusinessDecisionArtifactToEnea } from "./aprEneaPureMapper";
import { runProductVertical } from "./aprProductVertical";

const HASH = "c".repeat(64);
const locator = (sourceId: string) => ({ sourceId, pageNumber: 1, contentSha256: HASH, excerptSha256: HASH });

function resolvedInput() {
  const customerKey = "matrix-complete";
  const practiceId = "practice-matrix-complete";
  const economic = runEconomicVertical({
    customerKey, practiceId, sourceFingerprint: canonicalSha256("matrix-economic"), replacements: [], bankTransfers: [],
    invoices: [{ sourceId: "invoice", supplierId: "supplier", supplierName: null, documentNumber: "1", documentDate: "2026-01-01", kind: "invoice", taxableAmount: 100, vatAmount: 10, grossTotal: 110, referencedAdvanceIds: [], interventionGrossAmount: 110, extractionConfidence: "certain", extractionIssues: [], internalAdjustmentNote: null, explicitDeductibleLines: [], lineItems: [], locator: locator("invoice") }],
  });
  const product = runProductVertical({
    customerKey, practiceId, sourceFingerprint: canonicalSha256("matrix-product"), module: "screening",
    screeningObservations: [{ observationId: "line", sequence: 0, sourceId: "invoice", description: "Tenda", declaredQuantity: 1, originalWidth: 300, originalHeight: 200, explicitUnit: "cm", normalizedWidthMm: 3000, normalizedHeightMm: 2000, explicitSurfaceM2: 6, observedTransmittanceWm2K: null, locator: locator("invoice"), extractionMethod: "pdf_text", extractionRuleId: USER_AUTHORIZED_RULE_IDS.technicalProductCardinality }],
    screeningFormObservations: [{ sequence: 0, sourceId: "form", declaredType: "tenda_da_sole", locator: locator("form") }],
  });
  return {
    acquisitionArtifact: { schemaVersion: APR_L1_ACQUISITION_OBSERVATION_VERSION, customerKey, practiceId, artifactId: canonicalSha256("l1-matrix-complete"), status: "completed" as const, blockerCodes: [] },
    factsArtifacts: [economic.factsArtifact, product.factsArtifact],
    decisionArtifacts: [economic.decisionsArtifact, product.decisionsArtifact],
    mappingArtifacts: [mapBusinessDecisionArtifactToEnea(economic.decisionsArtifact), mapBusinessDecisionArtifactToEnea(product.decisionsArtifact)],
  };
}

describe("APR Slice 5 five-level case matrix", () => {
  it("aggrega una pratica risolta attraverso L1-L4 e lascia L5 non applicabile", () => {
    const matrix = buildFiveLevelCaseMatrix(resolvedInput());
    expect(matrix.payload).toMatchObject({ status: "complete", matrixBlockers: [], operationalAuthority: false });
    expect(matrix.payload.levels.map(({ level, status }) => ({ level, status }))).toEqual([
      { level: "L1", status: "completed" },
      { level: "L2", status: "completed" },
      { level: "L3", status: "completed" },
      { level: "L4", status: "completed" },
      { level: "L5", status: "not_applicable" },
    ]);
    expect(matrix.payload.levels[1].artifactIds).toHaveLength(2);
    expect(matrix.payload.levels[4]).toEqual({ level: "L5", status: "not_applicable", artifactIds: [], blockerCodes: [] });
  });

  it("propaga un blocco L3 senza nasconderlo o tentare L4", () => {
    const input = resolvedInput();
    const economic = runEconomicVertical({
      customerKey: input.acquisitionArtifact.customerKey,
      practiceId: input.acquisitionArtifact.practiceId,
      sourceFingerprint: canonicalSha256("blocked-economic"), replacements: [], bankTransfers: [],
      invoices: [{ sourceId: "invoice", supplierId: "supplier", supplierName: null, documentNumber: "2", documentDate: "2026-01-01", kind: "invoice", taxableAmount: 90, vatAmount: 10, grossTotal: 110, referencedAdvanceIds: [], interventionGrossAmount: 110, extractionConfidence: "certain", extractionIssues: [], internalAdjustmentNote: null, explicitDeductibleLines: [], lineItems: [], locator: locator("invoice") }],
    });
    const matrix = buildFiveLevelCaseMatrix({ ...input, factsArtifacts: [economic.factsArtifact], decisionArtifacts: [economic.decisionsArtifact], mappingArtifacts: [] });
    expect(matrix.payload.status).toBe("blocked");
    expect(matrix.payload.levels[2]).toMatchObject({ level: "L3", status: "blocked", blockerCodes: ["gross_triple_reconciliation_failed"] });
    expect(matrix.payload.levels[3]).toEqual({ level: "L4", status: "not_applicable", artifactIds: [], blockerCodes: [] });
    expect(matrix.payload.matrixBlockers).toEqual([]);
  });

  it("segnala come incoerenza L3 resolved ma L4 bloccato", () => {
    const input = resolvedInput();
    const facts = input.factsArtifacts[1];
    const resolvedButIncomplete = createBusinessDecisionsArtifact({
      factsArtifact: facts,
      decisions: input.decisionArtifacts[1].payload.decisions.map(({ decisionId: _decisionId, ...decision }) => ({
        ...decision,
        resolvedValue: { physicalRows: [{ widthMm: 3000 }] },
      })),
    });
    const blockedMapping = mapBusinessDecisionArtifactToEnea(resolvedButIncomplete);
    const matrix = buildFiveLevelCaseMatrix({ ...input, factsArtifacts: [facts], decisionArtifacts: [resolvedButIncomplete], mappingArtifacts: [blockedMapping] });
    expect(matrix.payload.status).toBe("inconsistent");
    expect(matrix.payload.levels[2].status).toBe("completed");
    expect(matrix.payload.levels[3]).toMatchObject({ status: "blocked", blockerCodes: ["apr_l4_mapping_value_invalid:product.screening.physical_rows"] });
    expect(matrix.payload.matrixBlockers).toContain("apr_matrix_inconsistent_l3_completed_l4_blocked");
  });

  it("produce esattamente la stessa matrice per gli stessi artefatti", () => {
    const input = resolvedInput();
    const first = buildFiveLevelCaseMatrix(input);
    const second = buildFiveLevelCaseMatrix(input);
    expect(first).toEqual(second);
    expect(first.payload.levels).toEqual(second.payload.levels);
    expect(Object.isFrozen(first.payload.levels[0])).toBe(true);
  });
});
