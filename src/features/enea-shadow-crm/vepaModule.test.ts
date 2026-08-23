import { describe, expect, it } from "vitest";
import { APR_VEPA_SHARED_ANAGRAPHIC_CONTRACT, aprVepaModuleReadinessSnapshot, buildAprVepaLocalPlan } from "./vepaModule";

describe("APR modulo VEPA · gate locale", () => {
  it("preserva due pezzi fisici e preferisce i metri quadri espliciti alle misure", () => {
    const plan = buildAprVepaLocalPlan({ practiceId: "vepa-1", displayName: "Cliente VEPA", formDeclaredCount: 1, invoiceLines: [{ sourceId: "fattura-1:p2", lineId: "riga-4", description: "N.2 VEPA vetrate panoramiche scorrevoli", quantity: 2, widthMm: 4000, heightMm: 2500, explicitSurfaceM2: 9.75, grossAmount: 6_000 }] });
    expect(plan).toMatchObject({ scheme: "bonus_casa", ecobonusAllowed: false, status: "ready_for_portal_mapping", totalPhysicalPieces: 2, totalSurfaceM2: 19.5, portalMappingVerified: false, draftAllowed: false, externalActionAllowed: false });
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows.every((row) => row.surfaceSource === "invoice_explicit_surface" && row.surfaceM2 === 9.75 && row.allocatedGrossAmount === 3000)).toBe(true);
    expect(plan.warnings).toEqual([expect.objectContaining({ code: "vepa_form_invoice_cardinality_difference", sourceIds: ["fattura-1:p2"] })]);
  });

  it("calcola la superficie dalle misure originarie senza aggregare i pezzi", () => {
    const plan = buildAprVepaLocalPlan({ practiceId: "vepa-2", displayName: "Due vetrate", invoiceLines: [{ sourceId: "fattura-2", lineId: "v1", description: "N.2 vetrate scorrevoli VEPA", quantity: 2, widthMm: 4720, heightMm: 2770 }] });
    expect(plan.rows.map((row) => [row.pieceNumber, row.surfaceM2, row.surfaceSource])).toEqual([[1, 13.0744, "invoice_dimensions"], [2, 13.0744, "invoice_dimensions"]]);
    expect(plan.totalSurfaceM2).toBe(26.1488);
  });

  it("blocca soltanto il caso quando quantita o superficie non sono documentate", () => {
    const plan = buildAprVepaLocalPlan({ practiceId: "vepa-3", displayName: "Caso incompleto", invoiceLines: [
      { sourceId: "fattura-3:p1", lineId: "a", description: "Fornitura VEPA", quantity: 0 },
      { sourceId: "fattura-3:p2", lineId: "b", description: "Vetrata panoramica", quantity: 1 },
    ] });
    expect(plan).toMatchObject({ status: "operator_required", totalPhysicalPieces: 0, draftAllowed: false });
    expect(plan.blockers.map((blocker) => blocker.code)).toEqual(["vepa_quantity_invalid:a", "vepa_surface_missing:b"]);
    expect(plan.nextAction).toContain("Richiesto intervento operatore");
  });

  it("dichiara esplicitamente non osservato il mapping portale", () => {
    expect(aprVepaModuleReadinessSnapshot()).toMatchObject({ product: "vepa", scheme: "bonus_casa", ecobonusAllowed: false, localSourceExtraction: "implemented_and_tested", physicalCardinality: "implemented_and_tested", sharedAnagraphicContract: "implemented_and_tested_locally", portalMapping: "not_observed", realDraft: "disabled", preview: "forbidden", submit: "forbidden" });
  });

  it("riusa il contratto anagrafico condiviso ma non inventa campi Bonus Casa", () => {
    expect(APR_VEPA_SHARED_ANAGRAPHIC_CONTRACT).toMatchObject({
      status: "local_contract_ready",
      scheme: "bonus_casa",
      ecobonusAllowed: false,
      portalFieldMapping: "not_observed",
      externalActionAllowed: false,
    });
    expect(APR_VEPA_SHARED_ANAGRAPHIC_CONTRACT.sections).toEqual(expect.arrayContaining([
      "beneficiary_identity",
      "co_beneficiaries",
      "residence",
      "property_identity",
      "building_qualification",
    ]));
    expect(APR_VEPA_SHARED_ANAGRAPHIC_CONTRACT.appliedRuleIds).toEqual(expect.arrayContaining([
      "user-2026-08-16-invoice-identity-over-customer-form",
      "user-2026-08-17-invoice-co-beneficiary-person-flow",
      "user-2026-08-16-fiscal-code-identity-cross-check",
    ]));
  });
});
