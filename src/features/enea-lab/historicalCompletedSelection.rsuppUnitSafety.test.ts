import { describe, expect, it } from "vitest";
import type { CompletedEneaAuditResult } from "./completedEneaAudit";
import { selectBestHistoricalCompletedAudit } from "./historicalBatchAudit";

function candidate(path: string, completedValue: string): CompletedEneaAuditResult {
  return {
    path,
    cpid: "288717-2026E-TEST",
    compared: 12,
    matches: 11,
    mismatches: 1,
    matchedFieldIds: ["beneficiario.cf"],
    differences: [{
      fieldId: "schermature.0.rsupp",
      completedValue,
      mappedValue: "0,08 Km²/W",
    }],
  };
}

describe("selezione duplicati PDF ENEA e unita Rsupp", () => {
  it("non considera la resistenza termica supplementare equivalente a una semplice area", () => {
    const thermalResistance = candidate("pratica/rsupp-corretta.pdf", "0,08 Km²/W");
    const wrongAreaUnit = candidate("pratica/rsupp-unita-errata.pdf", "0,08 m²");

    expect(() => selectBestHistoricalCompletedAudit([thermalResistance, wrongAreaUnit]))
      .toThrow("PDF ENEA conclusivi con lo stesso CPID ma risultati discordanti");
  });

  it("considera 0.080 e 0,08 la stessa Rsupp decimale", () => {
    const decimalPoint = candidate("pratica/rsupp-punto.pdf", "0.080 Km²/W");
    const decimalComma = candidate("pratica/rsupp-virgola.pdf", "0,08 Km²/W");

    expect(selectBestHistoricalCompletedAudit([decimalPoint, decimalComma]))
      .toBe(decimalPoint);
  });

  it("non interpreta 0.080 Km²/W come 80 Km²/W", () => {
    const fraction = candidate("pratica/rsupp-frazione.pdf", "0.080 Km²/W");
    const eighty = candidate("pratica/rsupp-ottanta.pdf", "80 Km²/W");

    expect(() => selectBestHistoricalCompletedAudit([fraction, eighty]))
      .toThrow("PDF ENEA conclusivi con lo stesso CPID ma risultati discordanti");
  });
});
