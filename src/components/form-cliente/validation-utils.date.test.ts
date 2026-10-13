import { describe, expect, it } from "vitest";
import { formatDataNascitaInput, normalizeItalianDateToIso } from "./validation-utils";

describe("normalizzazione date del form cliente", () => {
  it("converte la data italiana completa nel formato ISO del database", () => {
    expect(normalizeItalianDateToIso("25/10/2025")).toBe("2025-10-25");
  });

  it("mantiene la digitazione parziale e rifiuta conversioni impossibili", () => {
    expect(normalizeItalianDateToIso("25/10/20")).toBe("25/10/20");
    expect(normalizeItalianDateToIso("31/02/2025")).toBe("31/02/2025");
  });

  it("mostra nuovamente il formato italiano dopo il salvataggio ISO", () => {
    expect(formatDataNascitaInput("2025-10-25")).toBe("25/10/2025");
  });
});
