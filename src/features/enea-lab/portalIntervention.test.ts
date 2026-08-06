import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { mapSchermaturaPractice } from "./mapper";
import {
  ENEA_LAB_MOCK_ANALYSIS,
  ENEA_LAB_MOCK_PRACTICES,
} from "./mockPractices";
import {
  ENEA_INTERVENTION_PORTAL_FIELDS,
  buildEneaInterventionPortalScript,
} from "./portalIntervention";

describe("compilazione pagina intervento ENEA", () => {
  it("mappa i controlli reali e lascia vuota la zona urbanistica", () => {
    expect(ENEA_INTERVENTION_PORTAL_FIELDS.map(({ fieldId }) => fieldId)).toEqual([
      "intervento.ambito",
      "intervento.unita_oggetto",
      "intervento.accorpamenti",
      "intervento.data_inizio",
      "intervento.data_fine",
      "intervento.tipo",
      "intervento.impianto_centralizzato",
      "intervento.zona_urbanistica",
    ]);
    expect(ENEA_INTERVENTION_PORTAL_FIELDS.find(({ fieldId }) => fieldId === "intervento.zona_urbanistica"))
      .toMatchObject({ automatic: true });
  });

  it("prepara le regole PraticaRapida e il pulsante 345B", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const preparation = buildEneaInterventionPortalScript(mapped);

    expect(preparation.readyFieldIds).toEqual(expect.arrayContaining([
      "intervento.ambito",
      "intervento.unita_oggetto",
      "intervento.accorpamenti",
      "intervento.data_inizio",
      "intervento.data_fine",
      "intervento.tipo",
      "intervento.impianto_centralizzato",
    ]));
    expect(preparation.skippedFieldIds).toContain("intervento.zona_urbanistica");
    expect(preparation.script).toContain('"portalId":"id-comma-345b","control":"button"');
    expect(preparation.script).not.toContain('"portalId":"id-zona_urbanistica"');
    expect(preparation.script).not.toMatch(/\.submit\s*\(/);
  });

  it("compila i campi, sceglie il comma e non attiva Salva", async () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const { script } = buildEneaInterventionPortalScript(mapped);
    const dom = new JSDOM(`
      <form id="intervento">
        <select id="id-immobile"><option value=""></option><option value="253">Unità in edificio plurimo</option><option value="254">Edificio singolo</option></select>
        <input id="id-unita">
        <select id="id-acc"><option value=""></option><option value="S">Sì</option><option value="N">No</option></select>
        <input id="id-data_inizio"><input id="id-data_fine">
        <button id="id-comma-345a" type="button">345A</button>
        <button id="id-comma-345b" type="button">345B</button>
        <button id="id-comma-347a" type="button">347A</button>
        <select id="id-impianto_centralizzato"><option value=""></option><option value="S">Sì</option><option value="N">No</option></select>
        <select id="id-zona_urbanistica"><option value="">-</option></select>
        <button id="salva" type="submit">Salva</button>
      </form>
    `, { runScripts: "outside-only", url: "https://bonusfiscali.enea.it/intervento" });
    let interventionClickCount = 0;
    let submitCount = 0;
    dom.window.document.getElementById("id-comma-345b")?.addEventListener("click", () => {
      interventionClickCount += 1;
    });
    dom.window.document.getElementById("intervento")?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    const result = await dom.window.eval(script) as {
      compiled: string[];
      notFound: string[];
      notAvailable: string[];
    };

    expect((dom.window.document.getElementById("id-immobile") as HTMLSelectElement).value).toBe("254");
    expect((dom.window.document.getElementById("id-unita") as HTMLInputElement).value).toBe("1");
    expect((dom.window.document.getElementById("id-acc") as HTMLSelectElement).value).toBe("N");
    expect((dom.window.document.getElementById("id-data_inizio") as HTMLInputElement).value).toBe("01/07/2026");
    expect((dom.window.document.getElementById("id-data_fine") as HTMLInputElement).value).toBe("31/07/2026");
    expect((dom.window.document.getElementById("id-impianto_centralizzato") as HTMLSelectElement).value).toBe("N");
    expect((dom.window.document.getElementById("id-zona_urbanistica") as HTMLSelectElement).value).toBe("");
    expect(interventionClickCount).toBe(1);
    expect(result.compiled).toContain("id-comma-345b");
    expect(result.notFound).toEqual([]);
    expect(result.notAvailable).toEqual([]);
    expect(submitCount).toBe(0);
  });
});
