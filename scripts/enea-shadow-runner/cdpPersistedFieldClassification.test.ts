import { describe, expect, it } from "vitest";
import { classifyPersistedPageFieldsReadOnly } from "./cdpEneaBrowserDriver";

describe("classificazione GET canonica dei campi ENEA", () => {
  it("classifica non salvata una pagina con soli default portale e identificativi vuoti", () => {
    const fields = [
      ...Array.from({ length: 11 }, () => ({ control: "input", actual: "", matches: false, disabled: false })),
      { control: "select", actual: "Italia", matches: true, disabled: false },
      { control: "select", actual: "Italia", matches: true, disabled: false },
    ];
    expect(classifyPersistedPageFieldsReadOnly(fields)).toBe("not_saved");
  });

  it("resta inconclusiva se un campo discordante contiene un valore reale", () => {
    const fields = [
      ...Array.from({ length: 10 }, () => ({ control: "input", actual: "", matches: false, disabled: false })),
      { control: "input", actual: "Mario", matches: false, disabled: false },
      { control: "select", actual: "Italia", matches: true, disabled: false },
      { control: "select", actual: "Italia", matches: true, disabled: false },
    ];
    expect(classifyPersistedPageFieldsReadOnly(fields)).toBe("inconclusive");
  });

  it("classifica non salvato il reset Italia anche quando la fonte attende uno Stato estero", () => {
    const fields = [
      ...Array.from({ length: 11 }, () => ({ control: "input", actual: "", matches: false, disabled: false })),
      { control: "select", actual: "Italia", matches: false, disabled: false },
      { control: "select", actual: "Italia", matches: true, disabled: false },
    ];
    expect(classifyPersistedPageFieldsReadOnly(fields)).toBe("not_saved");
  });

  it("non scambia una superficie React non ancora caricata per una pagina server vuota", () => {
    expect(classifyPersistedPageFieldsReadOnly([
      { control: "input", actual: "<missing>", matches: false, disabled: false },
      { control: "input", actual: "<missing>", matches: false, disabled: false },
      { control: "input", actual: "<missing>", matches: false, disabled: false },
    ])).toBe("inconclusive");
  });

  it("classifica salvata soltanto la coincidenza integrale", () => {
    expect(classifyPersistedPageFieldsReadOnly([{ control: "input", actual: "Luciano", matches: true, disabled: false }])).toBe("saved");
  });
});
