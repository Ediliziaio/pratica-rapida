import { describe, expect, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import {
  APR_INFISSI_DEFAULT_THERMAL_TRANSMITTANCE_WM2K,
  isAcceptedEneaInfissiAreaRounding,
  resolveInfissiTechnicalSources,
  roundInfissoAreaForEnea,
} from "./infissiTechnicalSources";

describe("APR Infissi · fattura e documenti tecnici originari", () => {
  it("usa numero, misure e trasmittanza espliciti della fattura ed espande ogni pezzo 1:1", () => {
    const result = resolveInfissiTechnicalSources({
      practiceId: "infissi-fattura",
      invoice: {
        kind: "invoice",
        sourceIds: ["fattura-12-pagina-1"],
        rows: [{ lineId: "riga-4", quantity: 2, widthM: 1.234, heightM: 1.987, thermalTransmittanceWm2K: 1.1 }],
      },
    });

    expect(result.status).toBe("ready");
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.physicalRowId)).toEqual([
      "infissi-fattura:infisso:1",
      "infissi-fattura:infisso:2",
    ]);
    expect(result.rows[0]).toMatchObject({
      dimensionSourceKind: "invoice",
      transmittanceSourceKind: "invoice",
      eneaAreaM2: 2.5,
      thermalTransmittanceWm2K: 1.1,
    });
    expect(result.rows[0].exactAreaM2).toBeCloseTo(2.451958, 8);
  });

  it("mantiene cardinalita e misure della fattura e integra la trasmittanza dal documento tecnico associato", () => {
    const result = resolveInfissiTechnicalSources({
      practiceId: "infissi-fonti-complementari",
      invoice: {
        kind: "invoice",
        sourceIds: ["fattura-22"],
        rows: [
          { lineId: "fattura-riga-a", quantity: 1, widthM: 1.2, heightM: 1.4 },
          { lineId: "fattura-riga-b", quantity: 1, widthM: 0.8, heightM: 1.1 },
        ],
      },
      technicalDocuments: {
        kind: "technical_document",
        sourceIds: ["dop-pagine-1-2"],
        rows: [
          { lineId: "dop-b", quantity: 1, widthM: 0.8, heightM: 1.1, thermalTransmittanceWm2K: 1.2 },
          { lineId: "dop-a", quantity: 1, widthM: 1.2, heightM: 1.4, thermalTransmittanceWm2K: 1.05 },
        ],
      },
    });

    expect(result.status).toBe("ready");
    expect(result.audit.selectedDimensionSource).toBe("invoice");
    expect(result.rows.map((row) => row.thermalTransmittanceWm2K)).toEqual([1.05, 1.2]);
    expect(result.rows.every((row) => row.transmittanceSourceKind === "technical_document")).toBe(true);
    expect(result.audit.appliedRuleIds).toEqual(expect.arrayContaining([
      USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution,
      USER_AUTHORIZED_RULE_IDS.infissiAreaRounding,
      USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
    ]));
  });

  it("usa i documenti tecnici originari quando la fattura non riporta numero e misure", () => {
    const result = resolveInfissiTechnicalSources({
      practiceId: "infissi-documento-tecnico",
      invoice: {
        kind: "invoice",
        sourceIds: ["fattura-generica"],
        rows: [{ lineId: "fornitura-serramenti", quantity: 1 }],
      },
      technicalDocuments: {
        kind: "technical_document",
        sourceIds: ["scheda-tecnica-1"],
        rows: [{ lineId: "serramento-a", quantity: 3, widthM: 0.95, heightM: 1.35, thermalTransmittanceWm2K: 1.18 }],
      },
    });

    expect(result.status).toBe("ready");
    expect(result.rows).toHaveLength(3);
    expect(result.audit.selectedDimensionSource).toBe("technical_document");
    expect(result.rows.every((row) => row.dimensionSourceKind === "technical_document")).toBe(true);
  });

  it("non sceglie arbitrariamente quando fattura e documento tecnico confliggono", () => {
    const result = resolveInfissiTechnicalSources({
      practiceId: "infissi-conflitto",
      invoice: {
        kind: "invoice",
        sourceIds: ["fattura"],
        rows: [{ lineId: "fattura-riga", quantity: 2, widthM: 1, heightM: 1.4, thermalTransmittanceWm2K: 1.1 }],
      },
      technicalDocuments: {
        kind: "technical_document",
        sourceIds: ["scheda"],
        rows: [{ lineId: "scheda-riga", quantity: 3, widthM: 1, heightM: 1.4, thermalTransmittanceWm2K: 1.1 }],
      },
    });

    expect(result.status).toBe("operator_required");
    expect(result.rows).toEqual([]);
    expect(result.blockers).toContain("infissi_invoice_technical_document_cardinality_or_dimensions_conflict");
  });

  it("usa il fallback 1,3 soltanto se la trasmittanza manca in entrambe le fonti", () => {
    const result = resolveInfissiTechnicalSources({
      practiceId: "infissi-uw-assente",
      invoice: {
        kind: "invoice",
        sourceIds: ["fattura"],
        rows: [{ lineId: "riga", quantity: 1, widthM: 1, heightM: 1.2 }],
      },
    });

    expect(result.status).toBe("ready");
    expect(result.blockers).toEqual([]);
    expect(result.rows).toEqual([expect.objectContaining({
      thermalTransmittanceWm2K: APR_INFISSI_DEFAULT_THERMAL_TRANSMITTANCE_WM2K,
      transmittanceSourceKind: "authorized_fallback",
      transmittanceSourceIds: [],
    })]);
    expect(result.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback);
  });

  it("non usa il fallback quando esiste una trasmittanza esplicita", () => {
    const result = resolveInfissiTechnicalSources({
      practiceId: "infissi-uw-esplicita",
      invoice: {
        kind: "invoice",
        sourceIds: ["fattura"],
        rows: [{ lineId: "riga", quantity: 1, widthM: 1, heightM: 1.2, thermalTransmittanceWm2K: 0.94 }],
      },
    });
    expect(result).toMatchObject({
      status: "ready",
      rows: [{ thermalTransmittanceWm2K: 0.94, transmittanceSourceKind: "invoice", transmittanceSourceIds: ["fattura"] }],
    });
  });

  it("accetta il normale arrotondamento ENEA della superficie a un decimale", () => {
    expect(roundInfissoAreaForEnea(3.14159)).toBe(3.1);
    expect(isAcceptedEneaInfissiAreaRounding(3.14159, 3.1)).toBe(true);
    expect(isAcceptedEneaInfissiAreaRounding(3.14159, 3.2)).toBe(false);
  });

  it("preferisce la misura esterna ma accetta e audita un'altra misura documentata", () => {
    const external = resolveInfissiTechnicalSources({
      practiceId: "infissi-esterna",
      technicalDocuments: { kind: "technical_document", sourceIds: ["dop"], rows: [{ lineId: "a", quantity: 1, widthM: 1.718, heightM: 1.397, thermalTransmittanceWm2K: 1.3, measurementKind: "overall_external" }] },
    });
    const other = resolveInfissiTechnicalSources({
      practiceId: "infissi-altra-misura",
      technicalDocuments: { kind: "technical_document", sourceIds: ["dop"], rows: [{ lineId: "a", quantity: 1, widthM: 1.62, heightM: 1.195, thermalTransmittanceWm2K: 1.3, measurementKind: "other_documented" }] },
    });
    expect(external).toMatchObject({ status: "ready", rows: [{ measurementKind: "overall_external", eneaAreaM2: 2.4 }] });
    expect(other).toMatchObject({ status: "ready", rows: [{ measurementKind: "other_documented", eneaAreaM2: 1.9 }] });
  });
});
