import { describe, expect, it } from "vitest";
import { getFormCompletionCopy } from "./formCompletionCopy";

describe("form completion copy", () => {
  it("non dichiara un pagamento nelle pratiche a carico del rivenditore", () => {
    const copy = getFormCompletionCopy(false);
    expect(copy.title).toBe("Pratica inviata ✓");
    expect(copy.message).not.toMatch(/pagamento|fattura|SDI/i);
  });

  it("conferma il pagamento soltanto nel percorso che lo richiede", () => {
    const copy = getFormCompletionCopy(true);
    expect(copy.title).toMatch(/Pagamento effettuato/);
    expect(copy.message).toMatch(/SDI/);
  });
});
