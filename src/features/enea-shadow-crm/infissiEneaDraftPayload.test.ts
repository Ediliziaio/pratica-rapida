import { describe, expect, it } from "vitest";
import { resolveInfissiProductRules } from "./infissiProductRules";
import { resolveInfissiTechnicalSources } from "./infissiTechnicalSources";
import {
  auditInfissiPortalComputedEnergySavings,
  buildAprInfissiEneaDraftPayload,
} from "./infissiEneaDraftPayload";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import { resolveAprInfissiShadingClosureAllocation } from "./infissiShadingClosureAllocation";

function readyTechnical() {
  return resolveInfissiTechnicalSources({
    practiceId: "infissi-payload",
    invoice: {
      kind: "invoice",
      sourceIds: ["fattura-1"],
      rows: [{ lineId: "riga-1", quantity: 2, widthM: 1.2, heightM: 1.4, measurementKind: "overall_external" }],
    },
    technicalDocuments: {
      kind: "technical_document",
      sourceIds: ["dop-1"],
      rows: [{ lineId: "dop-1", quantity: 2, widthM: 1.2, heightM: 1.4, thermalTransmittanceWm2K: 1.1, measurementKind: "overall_external" }],
    },
  });
}

describe("payload tecnico locale Infissi per ENEA", () => {
  it("mappa ogni pezzo 1:1 con misure, superficie, trasmittanze, materiale, vetro e chiusure auditabili", () => {
    const productRules = resolveInfissiProductRules({
      practiceId: "infissi-payload",
      explicitNewFrameMaterial: "Legno",
      explicitGlassType: "Triplo basso emissivo",
      formOldFrameMaterial: "PVC",
      formOldGlazingType: "triplo",
      formAlsoInstalledClosures: true,
      formSourceId: "form-1",
    });
    const payload = buildAprInfissiEneaDraftPayload({
      practiceId: "infissi-payload",
      technical: readyTechnical(),
      productRules,
      invoiceGrossTotal: 4_200,
    });

    expect(payload).toMatchObject({
      interventionType: "comma_345a_building_envelope",
      physicalWindowCount: 2,
      expenseGrossVatIncluded: 4_200,
      portalManagedFields: { energySavings: "leave_unset_portal_computed" },
    });
    expect(payload.windows).toHaveLength(2);
    expect(payload.windows[0]).toMatchObject({
      widthM: 1.2,
      heightM: 1.4,
      areaM2: 1.7,
      newWindowThermalTransmittanceWm2K: 1.1,
      oldWindowThermalTransmittanceWm2K: 2.1,
      frameMaterial: "Legno",
      glassType: "Triplo basso emissivo",
      shadingClosuresChecked: true,
    });
    expect(payload.audit.fieldEvidence.filter((entry) => entry.physicalRowId === payload.windows[0].physicalRowId)).toHaveLength(7);
  });

  it("usa i fallback autorizzati e non produce mai un valore di risparmio energetico", () => {
    const payload = buildAprInfissiEneaDraftPayload({
      practiceId: "infissi-fallback",
      technical: resolveInfissiTechnicalSources({
        practiceId: "infissi-fallback",
        invoice: { kind: "invoice", sourceIds: ["fattura"], rows: [{ lineId: "r1", quantity: 1, widthM: 1, heightM: 1 }] },
      }),
      productRules: resolveInfissiProductRules({ practiceId: "infissi-fallback", formAlsoInstalledClosures: false, formSourceId: "form" }),
      invoiceGrossTotal: 1_000,
    });

    expect(payload.windows[0]).toMatchObject({
      newWindowThermalTransmittanceWm2K: 1.3,
      oldWindowThermalTransmittanceWm2K: 6,
      frameMaterial: "PVC",
      glassType: "Bassa emissivita",
      shadingClosuresChecked: false,
    });
    expect(payload).not.toHaveProperty("energySavingsKwhYear");
    expect(payload.windows[0]).not.toHaveProperty("energySavingsKwhYear");
    expect(JSON.stringify(payload)).not.toMatch(/observedValueKwhYear/);
    expect(payload.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiPortalManagedEnergySavings);
  });

  it("propaga l'allocazione parziale in ordine fattura nel payload e nell'audit per riga", () => {
    const technical = resolveInfissiTechnicalSources({
      practiceId: "partial-closures",
      invoice: { kind: "invoice", sourceIds: ["fattura"], rows: [{ lineId: "infissi", quantity: 3, widthM: 1.2, heightM: 1.4 }] },
    });
    const allocation = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 3,
      invoiceSources: [{ sourceId: "fattura", text: "FATTURA Tapparella N° 1 da 100 x 180 cm N° 1 da 120 x 180 cm" }],
      formAlsoInstalledClosures: true,
    });
    const payload = buildAprInfissiEneaDraftPayload({
      practiceId: "partial-closures",
      technical,
      productRules: resolveInfissiProductRules({ practiceId: "partial-closures", formAlsoInstalledClosures: true, formSourceId: "form" }),
      shadingClosureAllocation: allocation,
      invoiceGrossTotal: 3_000,
    });
    expect(payload.windows.map((window) => window.shadingClosuresChecked)).toEqual([true, true, false]);
    expect(payload.audit.fieldEvidence.filter((entry) => entry.field === "shadingClosuresChecked")).toEqual([
      expect.objectContaining({ source: expect.stringContaining("position=1"), ruleId: USER_AUTHORIZED_RULE_IDS.infissiShadingClosureInvoiceOrderAllocation }),
      expect.objectContaining({ source: expect.stringContaining("position=2"), ruleId: USER_AUTHORIZED_RULE_IDS.infissiShadingClosureInvoiceOrderAllocation }),
      expect.objectContaining({ source: expect.stringContaining("position=3"), ruleId: USER_AUTHORIZED_RULE_IDS.infissiShadingClosureInvoiceOrderAllocation }),
    ]);
  });

  it("conserva 1,31 dalla fonte e invia 1,3 a ENEA con audit della regola specifica", () => {
    const technical = resolveInfissiTechnicalSources({
      practiceId: "infissi-131",
      technicalDocuments: {
        kind: "technical_document",
        sourceIds: ["scheda-tecnica-pagina-2"],
        rows: [{ lineId: "serramento-1", quantity: 1, widthM: 1, heightM: 1.2, thermalTransmittanceWm2K: 1.31 }],
      },
    });
    const payload = buildAprInfissiEneaDraftPayload({
      practiceId: "infissi-131",
      technical,
      productRules: resolveInfissiProductRules({ practiceId: "infissi-131", formAlsoInstalledClosures: false, formSourceId: "form" }),
      invoiceGrossTotal: 1_500,
    });

    expect(payload.windows[0]).toMatchObject({
      sourceNewWindowThermalTransmittanceWm2K: 1.31,
      newWindowThermalTransmittanceWm2K: 1.3,
    });
    expect(payload.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittanceOverMaxTo13);
    expect(payload.audit.fieldEvidence).toContainEqual(expect.objectContaining({
      field: "newWindowThermalTransmittanceWm2K",
      source: expect.stringContaining("source=1.31;enea=1.3"),
      ruleId: USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittanceOverMaxTo13,
    }));
  });

  it("limita a 1,3 ogni valore esplicito superiore conservando la fonte", () => {
    const technical = resolveInfissiTechnicalSources({
      practiceId: "infissi-no-clamp",
      technicalDocuments: {
        kind: "technical_document",
        sourceIds: ["scheda-tecnica"],
        rows: [{ lineId: "serramento-1", quantity: 1, widthM: 1, heightM: 1, thermalTransmittanceWm2K: 1.32 }],
      },
    });
    const payload = buildAprInfissiEneaDraftPayload({
      practiceId: "infissi-no-clamp",
      technical,
      productRules: resolveInfissiProductRules({ practiceId: "infissi-no-clamp", formAlsoInstalledClosures: false, formSourceId: "form" }),
      invoiceGrossTotal: 1_000,
    });
    expect(payload.windows[0]).toMatchObject({
      sourceNewWindowThermalTransmittanceWm2K: 1.32,
      newWindowThermalTransmittanceWm2K: 1.3,
    });
    expect(payload.audit.fieldEvidence).toContainEqual(expect.objectContaining({
      field: "newWindowThermalTransmittanceWm2K",
      source: expect.stringContaining("source=1.32;enea=1.3"),
      ruleId: USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittanceOverMaxTo13,
    }));
  });

  it("non modifica valori espliciti minori o uguali al massimo ENEA", () => {
    for (const sourceValue of [0.9, 1.3]) {
      const technical = resolveInfissiTechnicalSources({
        practiceId: `infissi-within-${sourceValue}`,
        technicalDocuments: { kind: "technical_document", sourceIds: ["scheda-tecnica"], rows: [{ lineId: "serramento-1", quantity: 1, widthM: 1, heightM: 1, thermalTransmittanceWm2K: sourceValue }] },
      });
      const payload = buildAprInfissiEneaDraftPayload({
        practiceId: `infissi-within-${sourceValue}`,
        technical,
        productRules: resolveInfissiProductRules({ practiceId: `infissi-within-${sourceValue}`, formAlsoInstalledClosures: false, formSourceId: "form" }),
        invoiceGrossTotal: 1_000,
      });
      expect(payload.windows[0]).toMatchObject({ sourceNewWindowThermalTransmittanceWm2K: sourceValue, newWindowThermalTransmittanceWm2K: sourceValue });
    }
  });

  it("rifiuta un mapping con dati mancanti, ambigui o conflittuali", () => {
    const missingClosures = resolveInfissiProductRules({ practiceId: "infissi-blocked" });
    expect(() => buildAprInfissiEneaDraftPayload({
      practiceId: "infissi-blocked",
      technical: readyTechnical(),
      productRules: missingClosures,
      invoiceGrossTotal: 1_000,
    })).toThrow("infissi_mapping_not_ready");

    const conflictingTechnical = resolveInfissiTechnicalSources({
      practiceId: "infissi-conflict",
      invoice: { kind: "invoice", sourceIds: ["fattura"], rows: [{ lineId: "r1", quantity: 1, widthM: 1, heightM: 1 }] },
      technicalDocuments: { kind: "technical_document", sourceIds: ["dop"], rows: [{ lineId: "d1", quantity: 1, widthM: 2, heightM: 1 }] },
    });
    expect(() => buildAprInfissiEneaDraftPayload({
      practiceId: "infissi-conflict",
      technical: conflictingTechnical,
      productRules: resolveInfissiProductRules({ practiceId: "infissi-conflict", formAlsoInstalledClosures: false }),
      invoiceGrossTotal: 1_000,
    })).toThrow("infissi_mapping_not_ready");
  });

  it("registra in sola lettura il valore calcolato dal portale senza abilitarne la modifica", () => {
    const audit = auditInfissiPortalComputedEnergySavings({
      practiceId: "infissi-payload",
      observedValueKwhYear: 321.4,
      observedAt: "2026-08-19T15:00:00.000Z",
      evidenceId: "enea-server-summary:123",
    });
    expect(audit).toMatchObject({
      observedValueKwhYear: 321.4,
      source: "enea_portal_readonly",
      mutationAllowed: false,
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.infissiPortalManagedEnergySavings],
    });
  });
});
