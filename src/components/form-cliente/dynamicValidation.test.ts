import { describe, expect, it } from "vitest";
import { checkVisibleIf, validateDynamicStep } from "./dynamicValidation";

describe("dynamic form conditional payment documents", () => {
  it("nasconde il bonifico soltanto con finanziamento integrale", () => {
    const condition = { path: "documenti.finanziamento", not_equals: "si" };
    expect(checkVisibleIf(condition, { documenti: { finanziamento: "si" } })).toBe(false);
    expect(checkVisibleIf(condition, { documenti: { finanziamento: "in_parte" } })).toBe(true);
    expect(checkVisibleIf(condition, { documenti: { finanziamento: "no" } })).toBe(true);
  });

  it("richiede il bonifico quando non c'e finanziamento integrale", () => {
    const step = {
      key: "documenti",
      label: "Documenti di pagamento",
      fields: [{
        key: "bonifico_url",
        label: "Copia del bonifico parlante",
        type: "upload" as const,
        required: true,
        visible_if: { path: "documenti.finanziamento", not_equals: "si" },
      }],
    };
    expect(validateDynamicStep(step, { documenti: { finanziamento: "no" } }))
      .toHaveProperty("documenti.bonifico_url");
    expect(validateDynamicStep(step, { documenti: { finanziamento: "si" } }))
      .toEqual({});
  });
});
