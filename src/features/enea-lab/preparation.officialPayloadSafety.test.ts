import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapSchermaturaPractice } from "./mapper";
import { buildEneaBeneficiaryPortalScript } from "./portalBeneficiary";
import { buildEneaBuildingPortalScript } from "./portalBuilding";
import { buildEneaGeneratorPortalScript } from "./portalGenerator";
import { buildEneaInterventionPortalScript } from "./portalIntervention";
import { buildEneaPlantPortalScript } from "./portalPlant";
import { buildEneaScreeningPortalScript } from "./portalScreening";
import { buildEneaScreeningSummaryPortalScript } from "./portalScreeningSummary";
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

  it("limita il payload ufficiale ai soli campi realmente supportati dal contratto portale osservato", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
    const mapped = mapSchermaturaPractice(source, analysis, { includeTestConventions: false });
    const issues = validatePreparedPractice(source, mapped, analysis);
    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T08:00:00.000Z"));

    const screeningIndexes = mapped.sections
      .flatMap((section) => section.fields)
      .flatMap((field) => field.id.match(/^schermature\.(\d+)\.tipo$/)?.[1] ?? [])
      .map(Number);
    const supportedReadyIds = new Set([
      ...buildEneaBeneficiaryPortalScript(mapped).readyFieldIds,
      ...buildEneaBuildingPortalScript(mapped).readyFieldIds,
      ...buildEneaInterventionPortalScript(mapped).readyFieldIds,
      ...buildEneaPlantPortalScript(mapped).readyFieldIds,
      ...buildEneaGeneratorPortalScript(mapped, false).readyFieldIds,
      ...buildEneaScreeningSummaryPortalScript(mapped).readyFieldIds,
      ...screeningIndexes.flatMap((index) => buildEneaScreeningPortalScript(mapped, index).readyFieldIds),
    ]);

    expect(payload.portalFields.length).toBeGreaterThan(0);
    expect(payload.portalFields.every(({ id }) => supportedReadyIds.has(id))).toBe(true);
    expect(Object.keys(payload.fields).every((id) => supportedReadyIds.has(id))).toBe(true);
    expect(payload.portalFields.map(({ id }) => id).sort()).toEqual(Object.keys(payload.fields).sort());
    expect(payload.portalFields.some(({ id }) => id.startsWith("documenti."))).toBe(false);
    expect(payload.portalFields.some(({ id }) => id === "intervento.unita_totali")).toBe(false);
    expect(payload.portalFields.some(({ id }) => id === "immobile.gradi_giorno")).toBe(false);
    expect(payload.portalFields.some(({ id }) => /^schermature\.\d+\.dimensioni$/.test(id))).toBe(false);
  });
});
