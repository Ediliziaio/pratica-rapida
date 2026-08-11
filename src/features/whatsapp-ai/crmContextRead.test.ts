import { describe, expect, it } from "vitest";
import {
  WHATSAPP_CRM_READ_SELECT,
  mapWhatsappCrmReadRow,
} from "./crmContextRead";

describe("WhatsApp CRM read-only context", () => {
  it("seleziona soltanto il sottoinsieme CRM autorizzato", () => {
    expect(WHATSAPP_CRM_READ_SELECT).toContain("id");
    expect(WHATSAPP_CRM_READ_SELECT).toContain("prodotto_installato");
    expect(WHATSAPP_CRM_READ_SELECT).toContain("documenti_mancanti");
    expect(WHATSAPP_CRM_READ_SELECT).toContain("stage_type");

    const forbidden = [
      "cliente_cf",
      "cliente_indirizzo",
      "cliente_email",
      "cliente_telefono",
      "fatture_urls",
      "documenti_enea_urls",
      "documenti_aggiuntivi_urls",
      "guadagno_lordo",
      "guadagno_netto",
      "prezzo",
      "note_interne",
    ];

    for (const field of forbidden) {
      expect(WHATSAPP_CRM_READ_SELECT).not.toContain(field);
    }
  });

  it("mappa lo schema reale ENEA senza inventare il codice pratica", () => {
    const context = mapWhatsappCrmReadRow({
      id: "practice-42",
      prodotto_installato: "Schermature solari",
      documenti_mancanti: ["Bonifico parlante"],
      updated_at: "2026-08-11T20:00:00Z",
      pipeline_stages: { stage_type: "documenti_mancanti" },
    });

    expect(context).toEqual({
      practiceId: "practice-42",
      practiceCode: null,
      stage: "documenti_mancanti",
      product: "Schermature solari",
      updatedAt: "2026-08-11T20:00:00Z",
      missingDocuments: ["Bonifico parlante"],
    });
  });

  it("preserva le assenze reali come null invece di creare valori sintetici", () => {
    const context = mapWhatsappCrmReadRow({
      id: "practice-43",
      prodotto_installato: null,
      documenti_mancanti: null,
      updated_at: null,
      pipeline_stages: null,
    });

    expect(context.practiceCode).toBeNull();
    expect(context.stage).toBeNull();
    expect(context.product).toBeNull();
    expect(context.updatedAt).toBeNull();
    expect(context.missingDocuments).toEqual([]);
  });
});
