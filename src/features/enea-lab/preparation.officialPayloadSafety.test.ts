import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapSchermaturaPractice } from "./mapper";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

describe("payload ufficiale ENEA - campi non applicabili", () => {
  it("non prepara per il portale placeholder interni come Non indicato", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, undefined, { includeTestConventions: false });
    const issues = validatePreparedPractice(source, mapped);
    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T08:00:00.000Z"));

    expect(Object.values(payload.fields)).not.toContain("Non indicato");
    expect(payload.portalFields.some(({ value }) => value === "Non indicato")).toBe(false);
    expect(payload.portalFields.some(({ id }) => /^schermature\.\d+\.rsupp$/.test(id))).toBe(false);
  });
});
