import { describe, expect, it } from "vitest";
import type { CompletedEneaAuditResult } from "./completedEneaAudit";
import { selectBestHistoricalCompletedAudit } from "./historicalBatchAudit";

function candidate(
  path: string,
  compared: number,
  completedValue: string,
  mappedValue: string,
): CompletedEneaAuditResult {
  return {
    path,
    cpid: "288717-2026E-TEST",
    compared,
    matches: compared - 1,
    mismatches: 1,
    matchedFieldIds: ["beneficiario.cf"],
    differences: [{
      fieldId: "immobile.superficie",
      completedValue,
      mappedValue,
    }],
  };
}

describe("selezione duplicati PDF ENEA semanticamente equivalenti", () => {
  it("non tratta come conflitto la stessa differenza numerica con formattazione equivalente", () => {
    const partial = candidate(
      "pratica/revisione-parziale.pdf",
      12,
      "141 m²",
      "140 m²",
    );
    const complete = candidate(
      "pratica/revisione-completa.pdf",
      18,
      "141,0",
      "140,0",
    );

    expect(selectBestHistoricalCompletedAudit([partial, complete])).toBe(complete);
  });

  it("non considera equivalenti numeri uguali con unita fisiche incompatibili", () => {
    const area = candidate(
      "pratica/revisione-area.pdf",
      12,
      "141 m²",
      "140 m²",
    );
    const wrongUnit = candidate(
      "pratica/revisione-unita-errata.pdf",
      18,
      "141 kW",
      "140 kW",
    );

    expect(() => selectBestHistoricalCompletedAudit([area, wrongUnit]))
      .toThrow("PDF ENEA conclusivi con lo stesso CPID ma risultati discordanti");
  });
});
