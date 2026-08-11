import { describe, expect, it } from "vitest";
import type { CompletedEneaAuditResult } from "./completedEneaAudit";
import { selectBestHistoricalCompletedAudit } from "./historicalBatchAudit";

function audit(
  path: string,
  cpid: string | null,
  compared: number,
  mismatches = 0,
): CompletedEneaAuditResult {
  return {
    path,
    cpid,
    compared,
    matches: Math.max(0, compared - mismatches),
    mismatches,
    differences: Array.from({ length: mismatches }, (_, index) => ({
      fieldId: `campo.${index}`,
      completedValue: "storico",
      mappedValue: "corrente",
    })),
  };
}

describe("selezione PDF conclusivo per audit storico ENEA", () => {
  it("non si ferma a un primo PDF parziale senza CPID se ne esiste uno conclusivo valido", () => {
    const partial = audit("pratica/allegato-parziale.pdf", null, 18);
    const completed = audit("pratica/cpid-conclusivo.pdf", "288717-2026E-TEST", 12);

    expect(selectBestHistoricalCompletedAudit([partial, completed])).toBe(completed);
  });

  it("tra due PDF conclusivi con CPID preferisce quello con maggiore copertura", () => {
    const partial = audit("pratica/cpid-parziale.pdf", "288717-2026E-TEST", 7);
    const complete = audit("pratica/cpid-completo.pdf", "288717-2026E-TEST", 24, 3);

    expect(selectBestHistoricalCompletedAudit([partial, complete])).toBe(complete);
  });

  it("a parita di CPID e copertura non sceglie in base al numero di match", () => {
    const first = audit("pratica/revisione-a.pdf", "288717-2026E-TEST", 20, 4);
    const mapperFriendly = audit("pratica/revisione-b.pdf", "288717-2026E-TEST", 20, 0);

    expect(selectBestHistoricalCompletedAudit([first, mapperFriendly])).toBe(first);
  });
});
