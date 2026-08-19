import { describe, expect, it } from "vitest";
import {
  detectAprProductType,
  mapAprProductInventoryRow,
  summarizeAprProductInventory,
} from "./productIntegration";

const baseRow = {
  id: "00000000-0000-4000-8000-000000000099",
  prodotto_installato: "Infissi e schermature solari",
  form_compilato_at: "2026-08-18T10:00:00.000Z",
  fatture_urls: [],
  documenti_aggiuntivi_urls: [],
  pratica_enea_conclusa_urls: [],
  pipeline_stages: { stage_type: "pronte_da_fare" },
};

describe("APR multi-prodotto - etichette ambigue", () => {
  it("non assegna una pratica con piu famiglie prodotto al primo adapter che fa match", () => {
    expect(detectAprProductType("Infissi e schermature solari")).toBe("unknown");
    expect(detectAprProductType("Pompa di calore e insufflaggio")).toBe("unknown");
    expect(detectAprProductType("Serramenti + climatizzazione")).toBe("unknown");
  });

  it("mantiene le etichette multi-prodotto fuori dai corpus usati per scegliere il prossimo adapter", () => {
    const mapped = mapAprProductInventoryRow(baseRow);
    expect(mapped?.productType).toBe("unknown");
    expect(mapped?.integrationPhase).toBe("needs-classification");
    expect(mapped?.shadowEvaluationAllowed).toBe(false);
    expect(mapped?.officialSubmissionAllowed).toBe(false);

    const summary = summarizeAprProductInventory(mapped ? [mapped] : []);
    expect(summary.total).toBe(1);
    expect(summary.unknown).toBe(1);
    expect(summary.byProduct.infissi.total).toBe(0);
    expect(summary.byProduct.schermature.total).toBe(0);
    expect(summary.byProduct.impianto_termico.total).toBe(0);
    expect(summary.byProduct.insufflaggio.total).toBe(0);
  });
});
