import { describe, expect, it } from "vitest";
import { isHistoricalCpidCoherentWithFinishDate } from "./historicalBatchAudit";

describe("coerenza annualita PDF ENEA storico", () => {
  it("accetta un CPID Ecobonus dello stesso anno della fine lavori ISO", () => {
    expect(isHistoricalCpidCoherentWithFinishDate(
      "000001-2026E-SYNTHETICFIXTURE",
      "2026-07-14",
    )).toBe(true);
  });

  it("accetta anche la data italiana usata nel PDF conclusivo", () => {
    expect(isHistoricalCpidCoherentWithFinishDate(
      "000001-2026E-SYNTHETICFIXTURE",
      "14/07/2026",
    )).toBe(true);
  });

  it("rifiuta un PDF formalmente valido ma di un'altra annualita", () => {
    expect(isHistoricalCpidCoherentWithFinishDate(
      "000001-2025E-SYNTHETICFIXTURE",
      "2026-07-14",
    )).toBe(false);
  });

  it("non certifica l'annualita se la data di fine lavori e assente", () => {
    expect(isHistoricalCpidCoherentWithFinishDate(
      "000001-2026E-SYNTHETICFIXTURE",
      null,
    )).toBe(false);
    expect(isHistoricalCpidCoherentWithFinishDate(
      "000001-2026E-SYNTHETICFIXTURE",
      "",
    )).toBe(false);
  });

  it("rifiuta CPID o date non abbastanza strutturati per provare la coerenza", () => {
    expect(isHistoricalCpidCoherentWithFinishDate("000001-2026E", "2026-07-14")).toBe(false);
    expect(isHistoricalCpidCoherentWithFinishDate(
      "000001-2026E-SYNTHETICFIXTURE",
      "luglio 2026",
    )).toBe(false);
  });
});
