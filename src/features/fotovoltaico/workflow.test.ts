import { describe, expect, it } from "vitest";
import { PHOTOVOLTAICO_PIPELINE, PHOTOVOLTAICO_RESELLER_LABELS } from "./workflow";

describe("workflow fotovoltaico isolato", () => {
  it("ha otto colonne operative e non espone la bozza nella pipeline interna", () => {
    expect(PHOTOVOLTAICO_PIPELINE).toHaveLength(8);
    expect(PHOTOVOLTAICO_PIPELINE.map((column) => column.key)).not.toContain("bozza");
  });

  it("mantiene separati gli stati di attesa proprietario e rivenditore", () => {
    const keys = PHOTOVOLTAICO_PIPELINE.map((column) => column.key);
    expect(keys).toContain("attesa_proprietario");
    expect(keys).toContain("attesa_rivenditore");
  });

  it("mostra al rivenditore stati semplificati", () => {
    expect(PHOTOVOLTAICO_RESELLER_LABELS.attesa_proprietario).toBe("Raccolta documenti");
    expect(PHOTOVOLTAICO_RESELLER_LABELS.presso_distributore).toBe("Attesa gestore");
    expect(PHOTOVOLTAICO_RESELLER_LABELS.conclusa).toBe("Completata");
  });
});
