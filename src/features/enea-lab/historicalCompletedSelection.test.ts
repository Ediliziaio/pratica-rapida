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

  it("preferisce un CPID valido a un candidato malformato anche se il secondo ha piu campi", () => {
    const malformed = audit("pratica/cpid-troncato.pdf", "288717-2026E", 30);
    const completed = audit("pratica/cpid-conclusivo.pdf", "288717-2026E-TEST", 12);

    expect(selectBestHistoricalCompletedAudit([malformed, completed])).toBe(completed);
  });

  it("tra due PDF conclusivi con CPID uguale preferisce quello con maggiore copertura", () => {
    const partial = audit("pratica/cpid-parziale.pdf", "288717-2026E-TEST", 7);
    const complete = audit("pratica/cpid-completo.pdf", "288717-2026E-TEST", 24, 3);

    expect(selectBestHistoricalCompletedAudit([partial, complete])).toBe(complete);
  });

  it("considera lo stesso CPID equivalente anche con differenze innocue di maiuscole o spazi", () => {
    const first = audit("pratica/cpid-a.pdf", " 288717-2026e-test ", 12);
    const complete = audit("pratica/cpid-b.pdf", "288717-2026E-TEST", 20);

    expect(selectBestHistoricalCompletedAudit([first, complete])).toBe(complete);
  });

  it("blocca la selezione se la stessa pratica contiene PDF conclusivi con CPID diversi", () => {
    const first = audit("pratica/cpid-a.pdf", "288717-2026E-AAAA", 18);
    const foreign = audit("pratica/cpid-b.pdf", "288718-2026E-BBBB", 24);

    expect(() => selectBestHistoricalCompletedAudit([first, foreign]))
      .toThrow("PDF ENEA conclusivi con CPID discordanti nella stessa pratica.");
  });

  it("blocca PDF con lo stesso CPID e la stessa copertura ma risultati discordanti", () => {
    const first = audit("pratica/revisione-a.pdf", "288717-2026E-TEST", 20, 4);
    const conflicting = audit("pratica/revisione-b.pdf", "288717-2026E-TEST", 20, 0);

    expect(() => selectBestHistoricalCompletedAudit([first, conflicting]))
      .toThrow("PDF ENEA conclusivi con lo stesso CPID ma risultati discordanti.");
  });
});
