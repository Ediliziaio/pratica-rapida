import { describe, expect, it } from "vitest";
import { buildMinimalWhatsappCrmContext } from "./minimalCrmContext";

describe("WhatsApp minimal CRM context", () => {
  it("espone solo i campi necessari e scarta dati sensibili anche se presenti nella sorgente", () => {
    const context = buildMinimalWhatsappCrmContext({
      id: "practice-1",
      code: "ENEA-2026-001",
      stage: "pronte_da_fare",
      product: "Schermature solari",
      updatedAt: "2026-08-11T12:00:00Z",
      missingDocuments: ["Bonifico parlante"],
      codiceFiscale: "RSSMRA00A00H501X",
      indirizzo: "Via privata 1",
      invoiceUrl: "https://storage.example/invoice.pdf",
      importo: 2500,
    });

    expect(context).toEqual({
      practiceId: "practice-1",
      practiceCode: "ENEA-2026-001",
      stage: "pronte_da_fare",
      product: "Schermature solari",
      updatedAt: "2026-08-11T12:00:00Z",
      missingDocuments: ["Bonifico parlante"],
    });
    expect(JSON.stringify(context)).not.toContain("RSSMRA");
    expect(JSON.stringify(context)).not.toContain("Via privata");
    expect(JSON.stringify(context)).not.toContain("storage.example");
    expect(JSON.stringify(context)).not.toContain("2500");
  });

  it("limita la lista documenti per evitare prompt non controllati", () => {
    const context = buildMinimalWhatsappCrmContext({
      id: "practice-1",
      code: "ENEA-2026-001",
      stage: "documenti_mancanti",
      product: "Infissi",
      updatedAt: "2026-08-11T12:00:00Z",
      missingDocuments: Array.from({ length: 30 }, (_, index) => `Documento ${index + 1}`),
    });

    expect(context.missingDocuments).toHaveLength(20);
  });

  it("non inventa un codice o altri valori quando il CRM reale non li espone", () => {
    const context = buildMinimalWhatsappCrmContext({
      id: "practice-2",
      stage: null,
      product: null,
      updatedAt: null,
      missingDocuments: [],
    });

    expect(context).toEqual({
      practiceId: "practice-2",
      practiceCode: null,
      stage: null,
      product: null,
      updatedAt: null,
      missingDocuments: [],
    });
  });
});
