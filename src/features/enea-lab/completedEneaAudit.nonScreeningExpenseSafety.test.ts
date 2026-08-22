import { describe, expect, it } from "vitest";
import { parseCompletedEneaText } from "./completedEneaAudit";

describe("completed ENEA audit - product expense isolation", () => {
  it("non attribuisce agli schermi la spesa e il risparmio di un PDF infissi", () => {
    const parsed = parseCompletedEneaText(`
      Scheda intervento IN. Serramenti e infissi
      Spese congrue sostenute [€] 9996.66
      2. Risparmio stimato di energia primaria non rinnovabile [kWh/anno] 2165
      Il documento originale cartaceo
    `);

    expect(parsed.fields["schermature.spesa"]).toBeUndefined();
    expect(parsed.fields["schermature.risparmio_energia"]).toBeUndefined();
  });
});
