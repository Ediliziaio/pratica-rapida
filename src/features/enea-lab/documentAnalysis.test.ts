import { describe, expect, it } from "vitest";
import { pdfTextItemsToLines } from "./documentAnalysis";

describe("ricostruzione testo PDF", () => {
  it("conserva le righe necessarie a riconoscere totali e articoli", () => {
    expect(pdfTextItemsToLines([
      { str: "Fattura n. 42 del 01/07/2026", transform: [1, 0, 0, 1, 10, 700], hasEOL: true },
      { str: "SCHERMATURA SOLARE", transform: [1, 0, 0, 1, 10, 650] },
      { str: "LARGHEZZA 2900 X 1300", transform: [1, 0, 0, 1, 180, 650] },
      { str: "VALORE G TOT 0,13", transform: [1, 0, 0, 1, 360, 650], hasEOL: true },
      { str: "Totale", transform: [1, 0, 0, 1, 10, 100] },
      { str: "1.000,00", transform: [1, 0, 0, 1, 400, 100] },
    ])).toBe([
      "Fattura n. 42 del 01/07/2026",
      "SCHERMATURA SOLARE LARGHEZZA 2900 X 1300 VALORE G TOT 0,13",
      "Totale 1.000,00",
    ].join("\n"));
  });
});
