import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { intakeDiagnosticDetails, intakeErrorCode } from "./eneaIntakeDiagnostic";

describe("ENEA intake diagnostics", () => {
  it("records a stable backend code without error text", () => {
    expect(intakeErrorCode({ code: "23514", message: "personal data" })).toBe("23514");
  });

  it("keeps only field keys, route and selected-file counts", () => {
    const details = intakeDiagnosticDetails({
      event: "validation_failed", phase: "validation", fields: ["fattura", "nome cliente"],
      service: "documenti_forniti", documentsMode: "moduli_cartacei", product: "infissi",
      route: "/enea/nuova", selectedFiles: { fattura: 0 },
    });
    expect(details.fields).toEqual(["fattura"]);
    expect(details.selected_files.fattura).toBe(0);
    expect(JSON.stringify(details)).not.toContain("nome cliente");
  });

  it("shows the delivery decision immediately after Documenti Forniti, in one place", () => {
    const source = readFileSync("src/pages/rivenditore/NuovaPraticaEnea.tsx", "utf8");
    const question = "Vuoi che mandiamo la pratica ENEA al cliente una volta conclusa?";
    expect(source.split(question)).toHaveLength(2);
    expect(source.indexOf(question)).toBeGreaterThan(source.indexOf("Come vuoi fornire i dati del cliente?"));
    expect(source.indexOf(question)).toBeLessThan(source.indexOf("Tipo di prodotto installato"));
  });
});
