import { describe, expect, it } from "vitest";
import { mapQueueRow } from "./readOnlySource";

describe("mapQueueRow", () => {
  it("riconosce il primo form del rivenditore senza fingere che il cliente abbia compilato", () => {
    const result = mapQueueRow({
      id: "00000000-0000-4000-8000-000000000001",
      cliente_nome: "Cliente",
      cliente_cognome: "Demo Uno",
      prodotto_installato: "Schermature Solari",
      data_fine_lavori: "2026-07-13",
      fatture_urls: ["00000000-0000-4000-8000-000000000001/fattura.pdf"],
      documenti_aggiuntivi_urls: [],
      dati_form: null,
      form_compilato_at: null,
      created_at: "2026-07-13T09:00:00.000Z",
      updated_at: "2026-07-13T09:01:00.000Z",
      pipeline_stages: { stage_type: "inviata" },
      companies: { ragione_sociale: "Rivenditore Demo Uno" },
    });

    expect(result?.queueStatus).toBe("waiting_client");
    expect(result?.reseller).toBe("Rivenditore Demo Uno");
    expect(result?.form.richiedente.nome).toBe("");
  });

  it("riconosce il secondo form e conta i documenti senza scrivere nel CRM", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const result = mapQueueRow({
      id,
      cliente_nome: "Cliente",
      cliente_cognome: "Demo Uno",
      prodotto_installato: "Schermature Solari",
      data_fine_lavori: "2026-07-13",
      fatture_urls: [`${id}/fattura-rivenditore.pdf`],
      documenti_aggiuntivi_urls: [`${id}/scheda.pdf`],
      dati_form: {
        richiedente: { nome: "Cliente", cognome: "Demo Uno" },
        documenti: { fattura_url: `${id}/fattura-cliente.pdf` },
      },
      form_compilato_at: "2026-07-13T11:30:00.000Z",
      created_at: "2026-07-13T09:00:00.000Z",
      updated_at: "2026-07-13T11:30:00.000Z",
      pipeline_stages: { stage_type: "pronte_da_fare" },
      companies: { ragione_sociale: "Rivenditore Demo Uno" },
    });

    expect(result?.queueStatus).toBe("ready");
    expect(result?.form.richiedente.nome).toBe("Cliente");
    expect(result?.fattureCount).toBe(2);
    expect(result?.documentiCount).toBe(1);
  });
});
