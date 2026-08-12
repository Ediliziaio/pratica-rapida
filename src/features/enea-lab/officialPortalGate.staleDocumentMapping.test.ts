import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

describe("mapping documentale stale nel gate ENEA", () => {
  it("non riusa misure e gTot della vecchia analisi quando quella corrente non riconosce più le schermature", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const previousAnalysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
    if (!previousAnalysis) throw new Error("Fixture senza analisi documentale precedente.");

    const base = mapSchermaturaPractice(source, previousAnalysis, { includeTestConventions: true });
    const staleMapped = {
      ...base,
      sections: base.sections.map((section) => ({
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

          const staleDocumentSource = /^schermature\.\d+\.(?:dimensioni|gtot)$/.test(field.id)
            ? "Fattura" as const
            : /^schermature\.\d+\.superficie$/.test(field.id)
              ? "Calcolo ENEA" as const
              : "Inserimento operatore" as const;

          return {
            ...field,
            value,
            status: "ready" as const,
            source: staleDocumentSource,
            testOnly: false,
          };
        }),
      })),
    };

    const currentAnalysis = {
      ...previousAnalysis,
      items: [],
      documents: previousAnalysis.documents.map((document) => ({ ...document, itemCount: 0 })),
      blockers: ["Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture."],
      warnings: [],
    };

    // Riproduce il bypass precedente: il livello di preparazione vede ancora
    // campi tecnici ready provenienti dalla vecchia analisi e può costruire un
    // payload formalmente pronto nonostante quella corrente non li riconosca più.
    const issues = validatePreparedPractice(source, staleMapped, currentAnalysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
    const payload = buildEneaPayload(
      staleMapped,
      issues,
      "official",
      new Date("2026-08-12T08:00:00.000Z"),
    );
    expect(payload.readyForOfficialSubmission).toBe(true);

    const gate = prepareEneaOfficialPortalCollaudo(staleMapped, payload, true, currentAnalysis);

    expect(gate).toEqual({ status: "blocked", reason: "official-data-incomplete", workflow: null });
  });
});
