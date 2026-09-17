import { describe, expect, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { runEconomicVertical, type AprEconomicFactsInput } from "./aprEconomicVertical";
import { createBusinessDecisionsArtifact } from "./aprLevelSeparationContracts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { mapBusinessDecisionArtifactToEnea } from "./aprEneaPureMapper";
import { runProductVertical, type AprProductFactsInput } from "./aprProductVertical";

const HASH = "a".repeat(64);
const locator = (sourceId: string) => ({ sourceId, pageNumber: 1, contentSha256: HASH, excerptSha256: HASH });

function economic(): AprEconomicFactsInput {
  return {
    customerKey: "economic-l4",
    practiceId: "practice-economic-l4",
    sourceFingerprint: canonicalSha256("economic-l4"),
    invoices: [{
      sourceId: "invoice", supplierId: "supplier", supplierName: "Supplier", documentNumber: "1", documentDate: "2026-06-01",
      kind: "invoice", taxableAmount: 100, vatAmount: 10, grossTotal: 110, referencedAdvanceIds: [], interventionGrossAmount: 110,
      extractionConfidence: "certain", extractionIssues: [], internalAdjustmentNote: null, explicitDeductibleLines: [], lineItems: [], locator: locator("invoice"),
    }],
    bankTransfers: [],
    replacements: [],
  };
}

function screening(): AprProductFactsInput {
  return {
    customerKey: "screening-l4",
    practiceId: "practice-screening-l4",
    sourceFingerprint: canonicalSha256("screening-l4"),
    module: "screening",
    screeningObservations: [{
      observationId: "invoice:1", sequence: 0, sourceId: "invoice", description: "Tenda", declaredQuantity: 2,
      originalWidth: 300, originalHeight: 200, explicitUnit: "cm", normalizedWidthMm: 3000, normalizedHeightMm: 2000,
      explicitSurfaceM2: 6, observedTransmittanceWm2K: null, locator: locator("invoice"), extractionMethod: "pdf_text",
      extractionRuleId: USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
    }],
    screeningFormObservations: [{ sequence: 0, sourceId: "form", declaredType: "tenda_da_sole", locator: locator("form") }],
  };
}

function infissi(): AprProductFactsInput {
  return {
    customerKey: "infissi-l4",
    practiceId: "practice-infissi-l4",
    sourceFingerprint: canonicalSha256("infissi-l4"),
    module: "infissi",
    infissiSources: [{ sourceId: "invoice", kind: "invoice", text: "FATTURA INFISSI 1 da 1200 x 1400" }],
  };
}

describe("APR Slice 4 pure ENEA mapper", () => {
  it("mappa una decisione economica risolta senza rileggere le fonti", () => {
    const result = mapBusinessDecisionArtifactToEnea(runEconomicVertical(economic()).decisionsArtifact);
    expect(result.payload).toMatchObject({ status: "mapped", operationalAuthority: false, blockers: [] });
    expect(result.payload.portalFields).toEqual([expect.objectContaining({ fieldId: "calcolo.spesa_ammissibile_lorda_iva_inclusa", value: 110 })]);
  });

  it("mappa le righe fisiche Schermature gia decise da L3", () => {
    const result = mapBusinessDecisionArtifactToEnea(runProductVertical(screening()).decisionsArtifact);
    expect(result.payload.portalFields.map(({ fieldId, value }) => ({ fieldId, value }))).toEqual([
      { fieldId: "schermature.numero", value: 2 },
      { fieldId: "schermature.0.dimensioni", value: "3000 × 2000 mm" },
      { fieldId: "schermature.0.superficie", value: 6 },
      { fieldId: "schermature.1.dimensioni", value: "3000 × 2000 mm" },
      { fieldId: "schermature.1.superficie", value: 6 },
    ]);
  });

  it("mappa superficie e trasmittanza degli Infissi gia decisi da L3", () => {
    const result = mapBusinessDecisionArtifactToEnea(runProductVertical(infissi()).decisionsArtifact);
    expect(result.payload.portalFields.map(({ fieldId, value }) => ({ fieldId, value }))).toEqual([
      { fieldId: "infissi.numero", value: 1 },
      { fieldId: "infissi.0.superficie", value: 1.7 },
      { fieldId: "infissi.0.trasmittanza_nuovo", value: 1.3 },
    ]);
  });

  it("blocca senza default quando una decisione non e resolved", () => {
    const vertical = runEconomicVertical({ ...economic(), invoices: [{ ...economic().invoices[0], grossTotal: null, interventionGrossAmount: null }] });
    const result = mapBusinessDecisionArtifactToEnea(vertical.decisionsArtifact);
    expect(result.payload).toMatchObject({ status: "blocked", portalFields: [], consumedDecisionIds: [] });
    expect(result.payload.blockers).toContain("apr_l4_unresolved_decision:economic.eligibleExpense:invoice_final_printed_total_not_verified");
  });

  it("blocca senza inventare valori quando il resolvedValue atteso e incompleto", () => {
    const product = runProductVertical(screening());
    const incomplete = createBusinessDecisionsArtifact({
      factsArtifact: product.factsArtifact,
      decisions: product.decisionsArtifact.payload.decisions.map(({ decisionId: _decisionId, ...decision }) => ({ ...decision, resolvedValue: { physicalRows: [{ widthMm: 3000 }] } })),
    });
    const result = mapBusinessDecisionArtifactToEnea(incomplete);
    expect(result.payload).toMatchObject({ status: "blocked", portalFields: [] });
    expect(result.payload.blockers).toEqual(["apr_l4_mapping_value_invalid:product.screening.physical_rows"]);
  });

  it("produce lo stesso output diretto per lo stesso artefatto", () => {
    const artifact = runProductVertical(infissi()).decisionsArtifact;
    const first = mapBusinessDecisionArtifactToEnea(artifact);
    const second = mapBusinessDecisionArtifactToEnea(artifact);
    expect(first).toEqual(second);
    expect(first.payload.portalFields).toEqual(second.payload.portalFields);
    expect(Object.isFrozen(first.payload.portalFields[0])).toBe(true);
  });
});
