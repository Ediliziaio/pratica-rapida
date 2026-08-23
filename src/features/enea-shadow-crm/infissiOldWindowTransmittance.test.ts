import { describe, expect, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import {
  APR_INFISSI_OLD_WINDOW_FALLBACK_WM2K,
  resolveAprInfissiOldWindowTransmittance,
  type AprInfissiOldFrameMaterial,
  type AprInfissiOldGlazingType,
} from "./infissiOldWindowTransmittance";

const matrixCases: Array<[AprInfissiOldGlazingType, AprInfissiOldFrameMaterial, number]> = [
  ["vetro_singolo", "legno", 5],
  ["vetro_singolo", "pvc", 5],
  ["vetro_singolo", "metallo_taglio_termico", 5.3],
  ["vetro_singolo", "metallo_senza_taglio_termico", 6],
  ["vetro_singolo", "misto", 5.2],
  ["vetro_doppio", "legno", 3],
  ["vetro_doppio", "pvc", 3.5],
  ["vetro_doppio", "metallo_taglio_termico", 3.5],
  ["vetro_doppio", "metallo_senza_taglio_termico", 4.1],
  ["vetro_doppio", "misto", 3.2],
  ["vetro_triplo", "legno", 2.1],
  ["vetro_triplo", "pvc", 2.1],
  ["vetro_triplo", "metallo_taglio_termico", 2.5],
  ["vetro_triplo", "metallo_senza_taglio_termico", 3.4],
  ["vetro_triplo", "misto", 2.4],
  ["pannello", "legno", 2.8],
  ["pannello", "pvc", 2.8],
  ["pannello", "metallo_taglio_termico", 5.3],
  ["pannello", "metallo_senza_taglio_termico", 6],
  ["pannello", "misto", 5.2],
];

describe("APR Infissi · trasmittanza termica del vecchio infisso", () => {
  it.each(matrixCases)("mappa %s + %s a %s W/m²K", (glazing, material, expected) => {
    const result = resolveAprInfissiOldWindowTransmittance({
      oldFrameMaterial: material,
      oldGlazingType: glazing,
      formSourceId: "form-infissi",
    });
    expect(result).toMatchObject({
      thermalTransmittanceWm2K: expected,
      source: "form_matrix_combination",
      material,
      glazing,
      fallbackReason: null,
      audit: { formSourceId: "form-infissi" },
    });
    expect(result.audit.appliedRuleIds).toEqual([USER_AUTHORIZED_RULE_IDS.infissiOldWindowTransmittanceMatrix]);
  });

  it.each([
    ["materiale mancante", { oldGlazingType: "singolo" }, "missing_material"],
    ["vetro mancante", { oldFrameMaterial: "legno" }, "missing_glazing"],
    ["materiale ambiguo", { oldFrameMaterial: "metallo", oldGlazingType: "doppio" }, "ambiguous_or_unmapped_material"],
    ["vetro ambiguo", { oldFrameMaterial: "pvc", oldGlazingType: "vetrocamera" }, "ambiguous_or_unmapped_glazing"],
    ["dubbio esplicito", { oldFrameMaterial: "legno", oldGlazingType: "triplo", hasDoubt: true }, "explicit_doubt"],
  ] as const)("usa il fallback prudenziale per %s", (_label, input, fallbackReason) => {
    expect(resolveAprInfissiOldWindowTransmittance(input)).toMatchObject({
      thermalTransmittanceWm2K: APR_INFISSI_OLD_WINDOW_FALLBACK_WM2K,
      source: "authorized_precautionary_fallback",
      fallbackReason,
    });
  });
});
