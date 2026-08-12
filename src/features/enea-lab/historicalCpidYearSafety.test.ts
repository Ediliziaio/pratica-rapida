import { describe, expect, it } from "vitest";
import { isHistoricalCpidCoherentWithFinishDate } from "./historicalBatchAudit";

describe("coerenza annualita PDF ENEA storico", () => {
  it("accetta un CPID Ecobonus dello stesso anno della fine lavori ISO", () => {
    expect(isHistoricalCpidCoherentWithFinishDate(
      "288717-2026E-TFJHEYICFSKSRZCA",
      "2026-07-14",
    )).toBe(true);
  });

  it("accetta anche la data italiana usata nel PDF conclusivo", () => {
    expect(isHistoricalCpidCoherentWithFinishDate(
      "288717-2026E-TFJHEYICFSKSRZCA",
      "14/07/2026",
    )).toBe(true);
  });

  it("rifiuta un PDF formalmente valido ma di un'altra annualita", () => {
    expect(isHistoricalCpidCoherentWithFinishDate(
      "288717-2025E-TFJHEYICFSKSRZCA",
      "2026-07-14",
    )).toBe(false);
  });

  it("non certifica l'annualita se la data di fine lavori e assente", () => {
    expect(isHistoricalCpidCoherentWithFinishDate(
      "288717-2026E-TFJHEYICFSKSRZCA",
      null,
    )).toBe(false);
    expect(isHistoricalCpidCoherentWithFinishDate(
      "288717-2026E-TFJHEYICFSKSRZCA",
      "",
    )).toBe(false);
  });

  it("rifiuta CPID o date non abbastanza strutturati per provare la coerenza", () => {
    expect(isHistoricalCpidCoherentWithFinishDate("288717-2026E", "2026-07-14")).toBe(false);
    expect(isHistoricalCpidCoherentWithFinishDate(
      "288717-2026E-TFJHEYICFSKSRZCA",
      "luglio 2026",
    )).toBe(false);
  });
});
