import { describe, expect, it } from "vitest";
import { canonicalEneaServiceType } from "./eneaServiceType";

describe("canonicalEneaServiceType", () => {
  it("salva Documenti forniti con il valore canonico di produzione", () => {
    expect(canonicalEneaServiceType("documenti_forniti", false))
      .toBe("documenti_forniti");
  });

  it("mantiene Servizio completo", () => {
    expect(canonicalEneaServiceType("servizio_completo", false))
      .toBe("servizio_completo");
  });

  it("classifica Solo F-Gas come documenti forniti", () => {
    expect(canonicalEneaServiceType("servizio_completo", true))
      .toBe("documenti_forniti");
  });
});
