import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { runProductVertical, type AprProductFactsInput } from "./aprProductVertical";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";

const HASH = "a".repeat(64);
const locator = (sourceId: string) => ({ sourceId, pageNumber: 1, contentSha256: HASH, excerptSha256: HASH });

function screening(overrides: Partial<AprProductFactsInput> = {}): AprProductFactsInput {
  return {
    customerKey: "screening-case",
    practiceId: "practice-screening",
    sourceFingerprint: canonicalSha256("screening-source"),
    module: "screening",
    screeningObservations: [{
      observationId: "invoice:line-1",
      sequence: 0,
      sourceId: "invoice",
      description: "Tenda da sole",
      declaredQuantity: 2,
      originalWidth: 300,
      originalHeight: 200,
      explicitUnit: "cm",
      normalizedWidthMm: 3000,
      normalizedHeightMm: 2000,
      explicitSurfaceM2: 6,
      observedTransmittanceWm2K: null,
      locator: locator("invoice"),
      extractionMethod: "pdf_text",
      extractionRuleId: USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
    }],
    screeningFormObservations: [{ sequence: 0, sourceId: "form", declaredType: "tenda_da_sole", locator: locator("form") }],
    ...overrides,
  };
}

function infissi(sources: AprProductFactsInput["infissiSources"]): AprProductFactsInput {
  return {
    customerKey: "infissi-case",
    practiceId: "practice-infissi",
    sourceFingerprint: canonicalSha256("infissi-source"),
    module: "infissi",
    infissiSources: sources,
  };
}

describe("APR Slice 3 product vertical", () => {
  it("espande la quantita soltanto in L3 e conserva il gruppo dichiarato in L2", () => {
    const result = runProductVertical(screening());
    const fact = result.factsArtifact.payload.facts.find((item) => item.field.startsWith("product.screening.observation."));
    expect(fact?.value).toMatchObject({ declaredQuantity: 2, originalWidth: 300, explicitUnit: "cm" });
    expect(result).toMatchObject({ status: "ready", blockerCodes: [] });
    expect(result.physicalRows).toHaveLength(2);
    expect(result.physicalRows[0]).toMatchObject({ widthMm: 3000, heightMm: 2000, surfaceM2: 6 });
  });

  it("blocca fail-closed una superficie oltre il cinque per cento", () => {
    const input = screening();
    input.screeningObservations = [{ ...input.screeningObservations![0], explicitSurfaceM2: 5.7 }];
    const result = runProductVertical(input);
    expect(result.status).toBe("operator_required");
    expect(result.blockerCodes).toContain("screening_dimension_surface_conflict");
  });

  it("converte l'unita in L3 e blocca una normalizzazione L2 incoerente", () => {
    const input = screening();
    input.screeningObservations = [{ ...input.screeningObservations![0], normalizedWidthMm: 3001 }];
    const result = runProductVertical(input);
    expect(result.status).toBe("operator_required");
    expect(result.blockerCodes).toContain("screening_measurement_normalization_conflict");
  });

  it("accetta il confine esatto del cinque per cento e respinge quello immediatamente successivo", () => {
    const exact = screening();
    exact.screeningObservations = [{ ...exact.screeningObservations![0], explicitSurfaceM2: 6 / 1.05 }];
    expect(runProductVertical(exact).status).toBe("ready");
    const outside = screening();
    outside.screeningObservations = [{ ...outside.screeningObservations![0], explicitSurfaceM2: 6 / 1.0501 }];
    expect(runProductVertical(outside).blockerCodes).toContain("screening_dimension_surface_conflict");
  });

  it("richiede operatore quando gruppi form e prodotti non sono riconciliabili per famiglia", () => {
    const input = screening();
    input.screeningObservations = [
      input.screeningObservations![0],
      { ...input.screeningObservations![0], observationId: "invoice:line-2", sequence: 1, declaredQuantity: 1, description: "Persiana" },
    ];
    input.screeningFormObservations = [
      { sequence: 0, sourceId: "form", declaredType: "tenda_da_sole", locator: locator("form") },
      { sequence: 1, sourceId: "form", declaredType: "zanzariera", locator: locator("form") },
    ];
    expect(runProductVertical(input).blockerCodes).toContain("product_cardinality_form_invoice_mismatch");
  });

  it("risolve Infissi da certificato e applica soltanto in L3 il fallback Uw registrato", () => {
    const result = runProductVertical(infissi([{ sourceId: "invoice", kind: "invoice", text: "FATTURA INFISSI 1 da 1200 x 1400" }]));
    expect(result.status).toBe("ready");
    expect(result.physicalRows).toHaveLength(1);
    expect(result.physicalRows[0]).toMatchObject({ widthM: 1.2, heightM: 1.4, thermalTransmittanceWm2K: 1.3, transmittanceSourceKind: "authorized_fallback" });
  });

  it("conserva candidati Infissi discordanti in L2 e blocca la scelta in L3", () => {
    const result = runProductVertical(infissi([
      { sourceId: "invoice", kind: "invoice", text: "FATTURA INFISSI 1 da 1200 x 1400" },
      { sourceId: "certificate", kind: "third_party_certificate", text: "SERRAMENTO Larghezza L 1300 mm Altezza H = 1400 mm Uw = 1,2 W/m" },
      { sourceId: "certificate-copy", kind: "third_party_certificate", text: "SERRAMENTO Larghezza L 1300 mm Altezza H = 1400 mm Uw = 1,2 W/m" },
    ]));
    expect(result.factsArtifact.payload.facts.filter((fact) => fact.field.startsWith("product.infissi.candidate.")).length).toBeGreaterThanOrEqual(2);
    expect(result).toMatchObject({ status: "operator_required" });
    expect(result.blockerCodes).toContain("infissi_automatic_source_conflict");
  });

  it("esclude un documento interno anche se contiene lessico tecnico", () => {
    const result = runProductVertical(infissi([{ sourceId: "internal", kind: "crm_internal_technical_document", text: "SERRAMENTO 1200 x 1400 mm Uw 1,2 Quantita: 1" }]));
    expect(result.factsArtifact.payload.facts.filter((fact) => fact.field.startsWith("product.infissi.candidate."))).toHaveLength(0);
    expect(result.factsArtifact.payload.facts.find((fact) => fact.field.startsWith("product.infissi.excluded_source."))?.value)
      .toMatchObject({ sourceId: "internal", reason: "crm_internal_technical_document_not_authoritative" });
    expect(result.blockerCodes).toContain("infissi_dimensions_and_cardinality_missing");
  });

  it("e deterministico e gli artefatti sono profondamente immutabili", () => {
    const first = runProductVertical(screening());
    const second = runProductVertical(screening());
    expect(first.factsArtifact.artifactId).toBe(second.factsArtifact.artifactId);
    expect(first.decisionsArtifact.artifactId).toBe(second.decisionsArtifact.artifactId);
    expect(Object.isFrozen(first.factsArtifact.payload.facts[0])).toBe(true);
    expect(Object.isFrozen(first.decisionsArtifact.payload.decisions[0])).toBe(true);
  });

  it("non crea decisioni di materiale e non sblocca implicitamente il caso Amelia", () => {
    const input = screening();
    input.screeningObservations = [{ ...input.screeningObservations![0], description: "Altra schermatura solare - zanzariera" }];
    const result = runProductVertical(input);
    expect(result.decisionsArtifact.payload.operationalAuthority).toBe(false);
    expect(result.decisionsArtifact.payload.decisions.some((decision) => /material/i.test(decision.field))).toBe(false);
  });
});
