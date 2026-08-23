import { describe, expect, it } from "vitest";
import { expandClassifiedProductRows, expandTechnicalProductRows, technicalCardinalityMatches } from "./productCardinalityPolicy";

describe("cardinalità tecnica prodotti", () => {
  it("espande ogni quantità in righe 1:1 senza aggregare la superficie", () => {
    const rows = expandTechnicalProductRows({ sourceLineId: "invoice:line-3", quantity: 2, perPieceSurfaceM2: 8.19, attributes: { gTot: 0.19, exposure: "SUD" } });
    expect(rows).toEqual([
      { rowId: "invoice:line-3:piece-1", sourceLineId: "invoice:line-3", pieceNumber: 1, surfaceM2: 8.19, attributes: { gTot: 0.19, exposure: "SUD" } },
      { rowId: "invoice:line-3:piece-2", sourceLineId: "invoice:line-3", pieceNumber: 2, surfaceM2: 8.19, attributes: { gTot: 0.19, exposure: "SUD" } },
    ]);
    expect(rows.reduce((sum, row) => sum + row.surfaceM2, 0)).toBe(16.38);
  });

  it("mantiene una sola riga per quantità uno e rifiuta quantità non deterministiche", () => {
    expect(expandTechnicalProductRows({ sourceLineId: "s:1", quantity: 1, perPieceSurfaceM2: 6.754, attributes: {} })).toHaveLength(1);
    expect(() => expandTechnicalProductRows({ sourceLineId: "s:1", quantity: 1.5, perPieceSurfaceM2: 6.754, attributes: {} })).toThrow("quantità intera");
    expect(() => expandTechnicalProductRows({ sourceLineId: "s:1", quantity: 0, perPieceSurfaceM2: 6.754, attributes: {} })).toThrow("quantità intera");
  });

  it("rileva la regressione di una riga aggregata al posto di più prodotti", () => {
    const source = [{ sourceLineId: "roller", quantity: 2 }, { sourceLineId: "awning", quantity: 2 }, { sourceLineId: "awning-large", quantity: 1 }];
    expect(technicalCardinalityMatches(source, [{ sourceLineId: "roller" }, { sourceLineId: "awning" }, { sourceLineId: "awning-large" }])).toBe(false);
    expect(technicalCardinalityMatches(source, [
      { sourceLineId: "roller" }, { sourceLineId: "roller" }, { sourceLineId: "awning" }, { sourceLineId: "awning" }, { sourceLineId: "awning-large" },
    ])).toBe(true);
  });

  it("mantiene distinti nel ledger anche i prodotti esclusi dalla bozza ENEA", () => {
    const rows = expandClassifiedProductRows(
      { sourceLineId: "invoice:line-2:zanzariere", quantity: 6, perPieceSurfaceM2: 1, attributes: { family: "zanzariera" } },
      "enea_excluded",
      "Prodotto escluso dall'attuale test Ecobonus",
    );
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((row) => row.rowId)).size).toBe(6);
    expect(rows.every((row) => row.disposition === "enea_excluded" && row.reason.length > 0)).toBe(true);
    expect(() => expandClassifiedProductRows(
      { sourceLineId: "invoice:line-2", quantity: 1, perPieceSurfaceM2: 1, attributes: {} }, "enea_excluded", " ",
    )).toThrow("motivo auditabile");
  });
});
