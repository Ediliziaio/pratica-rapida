import { describe, expect, it } from "vitest";
import { getFormCompletionCopy } from "./formCompletionCopy";

describe("form completion copy", () => {
  it("non dichiara un pagamento nelle pratiche a carico del rivenditore", () => {
    const copy = getFormCompletionCopy(false, "Pratica Rapida");
    expect(copy.title).toBe("Pratica inviata ✓");
    expect(copy.message).not.toMatch(/pagamento|fattura|SDI/i);
  });

  it("conferma il pagamento soltanto nel percorso che lo richiede", () => {
    const copy = getFormCompletionCopy(true, "Pratica Rapida");
    expect(copy.title).toMatch(/Pagamento effettuato/);
    expect(copy.message).toMatch(/SDI/);
  });
});

describe("il marchio che firma la conferma", () => {
  it("e' quello passato, non uno fisso", () => {
    const copy = getFormCompletionCopy(false, "EneaSubito");
    expect(copy.message).toContain("EneaSubito");
    // Il nome dell'altro marchio non deve comparire: questo modulo finisce
    // dentro a entrambi i pacchetti.
    expect(copy.message).not.toContain("Pratica Rapida");
  });

  it("sulla conferma di pagamento non nomina nessuno", () => {
    const copy = getFormCompletionCopy(true, "EneaSubito");
    expect(copy.message).not.toContain("EneaSubito");
  });
});
