import { describe, expect, it } from "vitest";
import { classifyPersistedPageFieldsReadOnly } from "./cdpEneaBrowserDriver";

describe("classificazione read-only della persistenza pagina ENEA", () => {
  it("prova saved soltanto quando tutti i campi attesi coincidono", () => {
    expect(classifyPersistedPageFieldsReadOnly([
      { control: "input", actual: "Mario", matches: true, disabled: false },
      { control: "select", actual: "Italia", matches: true, disabled: false },
      { control: "button", actual: "enabled", matches: true, disabled: false },
    ])).toBe("saved");
  });

  it("prova not_saved soltanto quando tutti i campi significativi presenti sono vuoti", () => {
    expect(classifyPersistedPageFieldsReadOnly([
      { control: "input", actual: "", matches: false, disabled: false },
      { control: "select", actual: "-", matches: false, disabled: false },
      { control: "autocomplete", actual: "", matches: false, disabled: false },
      { control: "button", actual: "enabled", matches: true, disabled: false },
    ])).toBe("not_saved");
  });

  it("resta inconclusiva quando i controlli attesi non sono montati", () => {
    expect(classifyPersistedPageFieldsReadOnly([
      { control: "input", actual: "<missing>", matches: false, disabled: false },
      { control: "select", actual: "<missing>", matches: false, disabled: false },
    ])).toBe("inconclusive");
  });

  it("resta inconclusive con valori parziali, mismatch non vuoti o soli controlli non significativi", () => {
    expect(classifyPersistedPageFieldsReadOnly([
      { control: "input", actual: "Mario", matches: true, disabled: false },
      { control: "select", actual: "Francia", matches: false, disabled: false },
    ])).toBe("inconclusive");
    expect(classifyPersistedPageFieldsReadOnly([
      { control: "button", actual: "disabled", matches: false, disabled: true },
    ])).toBe("inconclusive");
  });
});
