import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_BUILDING_PORTAL_FIELDS } from "./portalBuilding";

describe("campi climatici derivati dal Comune ENEA", () => {
  it("non trasforma valori derivati/non scrivibili in blocker manuali pre-portale", () => {
    const fields = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0])
      .sections.flatMap((section) => section.fields);

    for (const fieldId of [
      "immobile.codice_comune",
      "immobile.zona_climatica",
      "immobile.gradi_giorno",
      "immobile.fascia_solare",
    ]) {
      expect(fields.find((field) => field.id === fieldId)).toMatchObject({
        required: false,
        editable: false,
      });
    }

    const portalDefinitions = new Map(
      ENEA_BUILDING_PORTAL_FIELDS.map((definition) => [definition.fieldId, definition]),
    );
    expect(portalDefinitions.has("immobile.codice_comune")).toBe(false);
    expect(portalDefinitions.has("immobile.zona_climatica")).toBe(false);
    expect(portalDefinitions.get("immobile.gradi_giorno")?.automatic).toBe(true);
    expect(portalDefinitions.has("immobile.fascia_solare")).toBe(false);
  });
});
