import { describe, expect, it } from "vitest";
import { infissiRowPersistenceSurfaceOutcome, infissiStagedRowOutcome, nestedUncertainPageSaveProbeAllowed } from "./infissiUncertainSavePolicy";

describe("ripresa sicura del Salva incerto per le righe Infissi", () => {
  it("ammette la sola verifica read-only delle righe Infissi", () => {
    expect(nestedUncertainPageSaveProbeAllowed("infissi", "screening:10")).toBe(true);
  });

  it("conserva il divieto legacy per le schermature annidate", () => {
    expect(nestedUncertainPageSaveProbeAllowed("screening", "screening:10")).toBe(false);
  });

  it("non modifica la politica delle pagine standard", () => {
    expect(nestedUncertainPageSaveProbeAllowed("infissi", "page:Serramenti e infissi")).toBe(true);
  });

  it("prova l'assenza della riga 10 soltanto se la tabella server contiene le nove precedenti", () => {
    expect(infissiRowPersistenceSurfaceOutcome("screening:10", 9, true)).toBe("absent");
    expect(infissiRowPersistenceSurfaceOutcome("screening:10", 10, true)).toBe("present");
    expect(infissiRowPersistenceSurfaceOutcome("screening:10", 0, true)).toBe("inconclusive");
    expect(infissiRowPersistenceSurfaceOutcome("screening:10", 9, false)).toBe("inconclusive");
  });

  it("riconosce la riga 10 anche se la tabella viene paginata o riordinata", () => {
    expect(infissiStagedRowOutcome({ pageId: "screening:10", visibleRowCount: 1, paginationTotal: 10, matchingVisibleRows: 1, expectedOccurrence: 1 })).toBe("present");
    expect(infissiStagedRowOutcome({ pageId: "screening:10", visibleRowCount: 9, paginationTotal: 10, matchingVisibleRows: 0, expectedOccurrence: 1 })).toBe("present");
    expect(infissiStagedRowOutcome({ pageId: "screening:10", visibleRowCount: 9, paginationTotal: 9, matchingVisibleRows: 0, expectedOccurrence: 1 })).toBe("absent");
  });

  it("preserva la cardinalita delle righe tecniche duplicate", () => {
    expect(infissiStagedRowOutcome({ pageId: "screening:4", visibleRowCount: 4, paginationTotal: null, matchingVisibleRows: 1, expectedOccurrence: 2 })).toBe("inconclusive");
    expect(infissiStagedRowOutcome({ pageId: "screening:4", visibleRowCount: 4, paginationTotal: null, matchingVisibleRows: 2, expectedOccurrence: 2 })).toBe("present");
    expect(infissiStagedRowOutcome({ pageId: "screening:10", visibleRowCount: 9, paginationTotal: 10, matchingVisibleRows: 0, expectedOccurrence: 2 })).toBe("present");
  });
});
