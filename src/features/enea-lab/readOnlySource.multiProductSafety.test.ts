import { describe, expect, it } from "vitest";
import { mapQueueRow } from "./readOnlySource";

const baseRow = {
  id: "00000000-0000-4000-8000-000000000901",
  cliente_nome: "Cliente",
  cliente_cognome: "Demo",
  cliente_email: null,
  cliente_telefono: null,
  cliente_cf: null,
  data_fine_lavori: "2026-08-20",
  fatture_urls: [],
  documenti_aggiuntivi_urls: [],
  pratica_enea_conclusa_urls: [],
  dati_form: null,
  form_compilato_at: "2026-08-20T05:00:00.000Z",
  created_at: "2026-08-20T04:00:00.000Z",
  updated_at: "2026-08-20T05:00:00.000Z",
  pipeline_stages: { stage_type: "pronte_da_fare" },
  companies: { ragione_sociale: "Rivenditore Demo" },
};

describe("ENEA Lab read-only queue - multi product safety", () => {
  it.each([
    "Schermature solari e pompa di calore",
    "Tende da sole + insufflaggio",
  ])("non inserisce una pratica multi-prodotto nella coda schermature: %s", (prodottoInstallato) => {
    const result = mapQueueRow({
      ...baseRow,
      prodotto_installato: prodottoInstallato,
    });

    expect(result).toBeNull();
  });

  it("continua ad accettare una pratica univocamente classificata come schermature", () => {
    const result = mapQueueRow({
      ...baseRow,
      prodotto_installato: "Schermature solari",
    });

    expect(result?.prodottoInstallato).toBe("Schermature solari");
  });
});
