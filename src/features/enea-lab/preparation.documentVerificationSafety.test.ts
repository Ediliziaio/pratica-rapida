import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { validatePreparedPractice } from "./preparation";

const unreadDocumentAnalysis = {
  items: [],
  invoiceTotal: 1000,
  creditTotal: 0,
  eligibleExpense: 1000,
  firstInvoiceDate: "2026-07-01",
  lastInvoiceDate: "2026-07-01",
  documents: [],
  blockers: ["Almeno un documento deve essere letto o controllato manualmente."],
  warnings: [],
};

const duplicateDocumentAnalysis = {
  ...unreadDocumentAnalysis,
  blockers: ["Possibile documento fiscale duplicato: verificare numero, data e importo prima di calcolare la spesa."],
};

describe("sicurezza verifica manuale documenti ENEA", () => {
  it("non considera letto un documento solo perché il campo di controllo è stato confermato", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const merelyConfirmed = mapSchermaturaPractice(source, unreadDocumentAnalysis, {
      confirmedFieldIds: new Set(["documenti.fatture"]),
    });

    expect(validatePreparedPractice(source, merelyConfirmed, unreadDocumentAnalysis)).toContainEqual(
      expect.objectContaining({
        severity: "blocker",
        message: "Almeno un documento deve essere letto o controllato manualmente.",
        fieldId: "documenti.fatture",
      }),
    );

    const manuallyVerified = mapSchermaturaPractice(source, unreadDocumentAnalysis, {
      overrides: { "documenti.fatture": "Verificate manualmente" },
    });

    expect(validatePreparedPractice(source, manuallyVerified, unreadDocumentAnalysis).some(
      ({ message }) => message === "Almeno un documento deve essere letto o controllato manualmente.",
    )).toBe(false);
  });

  it("mantiene il blocco duplicati finché anche i documenti non sono verificati manualmente", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const spendOnly = mapSchermaturaPractice(source, duplicateDocumentAnalysis, {
      overrides: { "schermature.spesa": "1.000,00 €" },
      confirmedFieldIds: new Set(["documenti.fatture"]),
    });

    expect(validatePreparedPractice(source, spendOnly, duplicateDocumentAnalysis)).toContainEqual(
      expect.objectContaining({
        severity: "blocker",
        message: duplicateDocumentAnalysis.blockers[0],
      }),
    );

    const fullyVerified = mapSchermaturaPractice(source, duplicateDocumentAnalysis, {
      overrides: {
        "schermature.spesa": "1.000,00 €",
        "documenti.fatture": "Verificate manualmente",
      },
    });

    expect(validatePreparedPractice(source, fullyVerified, duplicateDocumentAnalysis).some(
      ({ message }) => message === duplicateDocumentAnalysis.blockers[0],
    )).toBe(false);
  });
});
