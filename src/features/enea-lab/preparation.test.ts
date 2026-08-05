import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapSchermaturaPractice } from "./mapper";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

describe("preparazione pacchetto ENEA", () => {
  it("include le convenzioni nel test ma le esclude dal pacchetto ufficiale", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const issues = validatePreparedPractice(ENEA_LAB_MOCK_PRACTICES[0], mapped);
    const now = new Date("2026-08-05T12:00:00.000Z");
    const testPayload = buildEneaPayload(mapped, issues, "test", now);
    const officialPayload = buildEneaPayload(mapped, issues, "official", now);

    expect(testPayload.fields["impianto.potenza"]).toMatch(/kW$/);
    expect(officialPayload.fields["impianto.potenza"]).toBeUndefined();
    expect(officialPayload.excludedTestFields).toEqual(expect.arrayContaining([
      "impianto.potenza",
      "impianto.rendimento",
    ]));
    expect(officialPayload.readyForOfficialSubmission).toBe(false);
    expect(officialPayload.excludedUnverifiedFields).toContain("immobile.codice_comune");
    expect(Object.values(officialPayload.fields)).not.toContain("Intervento umano richiesto");
    expect(officialPayload.interventionRequired.length).toBeGreaterThan(0);
  });

  it("blocca una pratica ancora in attesa del cliente", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[1];
    const mapped = mapSchermaturaPractice(source);
    const issues = validatePreparedPractice(source, mapped);

    expect(issues).toContainEqual(expect.objectContaining({
      code: "client-form-not-ready",
      severity: "blocker",
    }));
  });
});
