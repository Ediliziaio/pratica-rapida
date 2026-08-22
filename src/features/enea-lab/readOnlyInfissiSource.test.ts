import { describe, expect, it } from "vitest";
import { mapInfissiQueueRow } from "./readOnlyInfissiSource";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    cliente_nome: "Sebastian Costel",
    cliente_cognome: "Volf",
    cliente_email: "test@example.invalid",
    cliente_telefono: "000",
    cliente_cf: "",
    prodotto_installato: "Infissi / Serramenti",
    data_fine_lavori: "2026-07-31",
    fatture_urls: ["11111111-2222-3333-4444-555555555555/fatture/fattura.pdf"],
    documenti_aggiuntivi_urls: ["11111111-2222-3333-4444-555555555555/tecnici/scheda.pdf"],
    pratica_enea_conclusa_urls: ["11111111-2222-3333-4444-555555555555/enea/conclusa.pdf"],
    dati_form: {
      prodotto: {
        tipo: "infissi",
        vecchi_materiale: "legno",
        vecchi_vetro: "doppio",
        nuovi_materiale: "pvc",
        nuovi_vetro: "triplo",
        zanzariere_tapparelle: false,
      },
    },
    form_compilato_at: "2026-07-30T10:00:00Z",
    created_at: "2026-07-29T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
    pipeline_stages: { stage_type: "archiviate" },
    companies: { ragione_sociale: "Rivenditore Test" },
    ...overrides,
  } as never;
}

describe("APR read-only source infissi", () => {
  it("mappa pratica infissi storica e conserva solo path appartenenti alla pratica", () => {
    const practice = mapInfissiQueueRow(row());

    expect(practice).not.toBeNull();
    expect(practice?.clienteNome).toBe("Sebastian Costel");
    expect(practice?.clienteCognome).toBe("Volf");
    expect(practice?.queueStatus).toBe("historical");
    expect(practice?.fattureCount).toBe(1);
    expect(practice?.completedEneaPaths).toHaveLength(1);
  });

  it("Erremme è esclusa incondizionatamente dal mapper Infissi", () => {
    expect(mapInfissiQueueRow(row({
      companies: { ragione_sociale: "ERREMME S.R.L." },
    }))).toBeNull();
  });

  it("non assorbe prodotti diversi dagli infissi", () => {
    expect(mapInfissiQueueRow(row({
      prodotto_installato: "Schermature solari",
    }))).toBeNull();
  });
});
