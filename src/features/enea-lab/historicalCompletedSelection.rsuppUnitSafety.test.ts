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
});
