import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

describe("gate pre-collaudo ENEA ufficiale", () => {
  function fixture() {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
    const mapped = mapSchermaturaPractice(source, analysis, { includeTestConventions: true });
    const issues = validatePreparedPractice(source, mapped, analysis);
    return { mapped, issues };
  }

  it("blocca una pratica con dati ufficiali ancora incompleti", () => {
    const { mapped, issues } = fixture();
    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T08:00:00.000Z"));

    const gate = prepareEneaOfficialPortalCollaudo(mapped, payload, true);

    expect(gate).toEqual({ status: "blocked", reason: "official-data-incomplete", workflow: null });
  });

  it("blocca sempre un pacchetto diventato obsoleto", () => {
    const { mapped, issues } = fixture();
    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T08:00:00.000Z"));

    const gate = prepareEneaOfficialPortalCollaudo(mapped, payload, false);

    expect(gate).toEqual({ status: "blocked", reason: "package-not-current", workflow: null });
  });

  it("rifiuta un payload di prova anche se il chiamante tenta di usarlo come ufficiale", () => {
    const { mapped, issues } = fixture();
    const payload = buildEneaPayload(mapped, issues, "test", new Date("2026-08-12T08:00:00.000Z"));

    const gate = prepareEneaOfficialPortalCollaudo(mapped, payload, true);

    expect(gate).toEqual({ status: "blocked", reason: "payload-not-official", workflow: null });
  });

  it("restituisce soltanto un workflow official quando il payload corrente supera tutte le barriere", () => {
    const { mapped, issues } = fixture();
    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T08:00:00.000Z"));
    const readyPayload = {
      ...payload,
      readyForOfficialSubmission: true,
      interventionRequired: [],
    };

    const gate = prepareEneaOfficialPortalCollaudo(mapped, readyPayload, true);

    expect(gate.status).toBe("ready");
    if (gate.status !== "ready") throw new Error("Il gate doveva essere pronto nel caso positivo sintetico.");
    expect(gate.workflow.mode).toBe("official");
    expect(gate.workflow.script).not.toContain('"portalId":"id-n"');
    expect(gate.workflow.script).not.toContain('"portalId":"id-pn"');
  });

  it("blocca payload dichiarati pronti ma internamente incoerenti", () => {
    const { mapped, issues } = fixture();
    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T08:00:00.000Z"));
    const poisonedPayload = {
      ...payload,
      readyForOfficialSubmission: true,
      interventionRequired: [],
      portalFields: payload.portalFields.map((field, index) => index === 0 ? { ...field, testOnly: true } : field),
    };

    const gate = prepareEneaOfficialPortalCollaudo(mapped, poisonedPayload, true);

    expect(gate).toEqual({ status: "blocked", reason: "payload-inconsistent", workflow: null });
  });
});
