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

  function independentlyReadyMapped() {
    const { mapped } = fixture();
    return {
      ...mapped,
      sections: mapped.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => {
          if (!field.required) return field;
          let value = field.value;
          if (field.id === "intervento.data_inizio") value = "01/01/2026";
          else if (field.id === "intervento.data_fine") value = "02/01/2026";
          else if (field.id === "impianto.numero_generatori") value = "1";
          else if (field.id === "impianto.rendimento") value = "95";
          else if (field.id === "impianto.potenza") value = "25 kW";
          else if (/\.dimensioni$/.test(field.id)) value = "1000 × 1000 mm";
          else if (/\.superficie(?:_finestrata)?$/.test(field.id)) value = "1,0 m²";
          else if (field.id === "schermature.spesa") value = "1000 €";
          else if (/^(?:Non indicato|Intervento umano richiesto)$/i.test(value.trim())) value = "Valore verificato";
          return {
            ...field,
            value,
            status: "ready" as const,
            source: "Inserimento operatore" as const,
            testOnly: false,
          };
        }),
      })),
    };
  }

  function readyPayload() {
    const mapped = independentlyReadyMapped();
    const issues = validatePreparedPractice(mapped.source, mapped);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T08:00:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);
    return { mapped, payload };
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

  it("non si fida dei flag di readiness se il mapping corrente contiene ancora blocker", () => {
    const { mapped, issues } = fixture();
    expect(issues.some((issue) => issue.severity === "blocker")).toBe(true);
    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T08:00:00.000Z"));
    const poisonedPayload = {
      ...payload,
      readyForOfficialSubmission: true,
      interventionRequired: [],
    };

    const gate = prepareEneaOfficialPortalCollaudo(mapped, poisonedPayload, true);

    expect(gate).toEqual({ status: "blocked", reason: "official-data-incomplete", workflow: null });
  });

  it("rivalida anche i blocker dell'analisi documentale corrente", () => {
    const { mapped, payload } = readyPayload();
    const baseAnalysis = ENEA_LAB_MOCK_ANALYSIS[mapped.source.id];
    if (!baseAnalysis) throw new Error("Fixture senza analisi documentale.");
    const analysisWithBlocker = {
      ...baseAnalysis,
      blockers: ["Controllo documentale non risolto: verificare manualmente il documento fiscale."],
      warnings: [],
    };

    const gate = prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysisWithBlocker);

    expect(gate).toEqual({ status: "blocked", reason: "official-data-incomplete", workflow: null });
  });

  it("restituisce soltanto un workflow official quando mapping e payload superano indipendentemente tutte le barriere", () => {
    const { mapped, payload } = readyPayload();

    const gate = prepareEneaOfficialPortalCollaudo(mapped, payload, true);

    expect(gate.status).toBe("ready");
    if (gate.status !== "ready") throw new Error("Il gate doveva essere pronto nel caso positivo verificato.");
    expect(gate.workflow.mode).toBe("official");
    expect(gate.workflow.script).toContain('"portalId":"id-n"');
    expect(gate.workflow.script).toContain('"portalId":"id-pn"');
  });

  it("blocca payload dichiarati pronti ma internamente incoerenti", () => {
    const { mapped, payload } = readyPayload();
    const poisonedPayload = {
      ...payload,
      portalFields: payload.portalFields.map((field, index) => index === 0 ? { ...field, testOnly: true } : field),
    };

    const gate = prepareEneaOfficialPortalCollaudo(mapped, poisonedPayload, true);

    expect(gate).toEqual({ status: "blocked", reason: "payload-inconsistent", workflow: null });
  });

  it("blocca un payload ufficiale appartenente a un'altra pratica", () => {
    const { mapped, payload } = readyPayload();
    const poisonedPayload = { ...payload, practiceCode: `${payload.practiceCode}-ALTRO` };

    const gate = prepareEneaOfficialPortalCollaudo(mapped, poisonedPayload, true);

    expect(gate).toEqual({ status: "blocked", reason: "payload-inconsistent", workflow: null });
  });

  it("blocca un payload che omette in modo coerente un campo ufficiale", () => {
    const { mapped, payload } = readyPayload();
    const omittedId = payload.portalFields[0]?.id;
    if (!omittedId) throw new Error("Fixture ufficiale senza campi portale.");
    const fields = { ...payload.fields };
    delete fields[omittedId];
    const poisonedPayload = {
      ...payload,
      fields,
      portalFields: payload.portalFields.filter((field) => field.id !== omittedId),
    };

    const gate = prepareEneaOfficialPortalCollaudo(mapped, poisonedPayload, true);

    expect(gate).toEqual({ status: "blocked", reason: "payload-inconsistent", workflow: null });
  });

  it("blocca la manipolazione del valore portale mantenendo invariati gli id", () => {
    const { mapped, payload } = readyPayload();
    const poisonedPayload = {
      ...payload,
      portalFields: payload.portalFields.map((field, index) => index === 0 ? { ...field, value: `${field.value}-ALTERATO` } : field),
    };

    const gate = prepareEneaOfficialPortalCollaudo(mapped, poisonedPayload, true);

    expect(gate).toEqual({ status: "blocked", reason: "payload-inconsistent", workflow: null });
  });
});
