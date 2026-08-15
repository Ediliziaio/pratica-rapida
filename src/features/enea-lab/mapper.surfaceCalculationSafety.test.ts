import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";

describe("mapper ENEA - superficie ricalcolata", () => {
  it("non dichiara ready una superficie che diventa zero dopo il calcolo ENEA", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      overrides: { "schermature.0.dimensioni": "100 × 100 mm" },
    });
    const fields = mapped.sections.flatMap((section) => section.fields);
    const dimensions = fields.find((field) => field.id === "schermature.0.dimensioni");
    const surface = fields.find((field) => field.id === "schermature.0.superficie");

    expect(dimensions).toMatchObject({
      value: "100 × 100 mm",
      source: "Inserimento operatore",
      status: "ready",
    });
    expect(surface?.status).toBe("missing");
    expect(surface?.value).not.toBe("0,0 m²");
  });
});
