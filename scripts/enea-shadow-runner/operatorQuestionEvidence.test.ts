import { describe, expect, it } from "vitest";
import { operatorQuestionEvidenceAroundLabel } from "./operatorQuestionEvidence";

describe("contesto formato nelle domande operatore", () => {
  it("restituisce al massimo quindici righe numerate attorno all'etichetta", () => {
    const source = Array.from({ length: 30 }, (_, index) => index === 18 ? "TOTALE ORDINE" : `riga ${index + 1}`).join("\n");
    const context = operatorQuestionEvidenceAroundLabel(source, /totale\s+ordine/i);
    expect(context?.labelLine).toBe(19);
    expect(context?.lines).toHaveLength(15);
    expect(context?.rendered).toContain("L19: TOTALE ORDINE");
  });

  it("non inventa contesto quando l'etichetta non esiste", () => {
    expect(operatorQuestionEvidenceAroundLabel("nessuna misura disponibile", /totale\s+ordine/i)).toBeNull();
  });

  it("non supera mai il limite anche se il chiamante ne chiede di piu'", () => {
    const source = ["Misure", ...Array.from({ length: 30 }, (_, index) => `riga ${index}`)].join("\n");
    expect(operatorQuestionEvidenceAroundLabel(source, /misure/i, 100)?.lines).toHaveLength(15);
  });
});
