import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { mapSchermaturaPractice } from "./mapper";
import {
  ENEA_LAB_MOCK_ANALYSIS,
  ENEA_LAB_MOCK_PRACTICES,
} from "./mockPractices";
import {
  ENEA_PLANT_PORTAL_FIELDS,
  buildEneaPlantPortalScript,
} from "./portalPlant";

describe("compilazione pagina impianto termico esistente ENEA", () => {
  it("mappa i controlli reali della pagina principale", () => {
    expect(ENEA_PLANT_PORTAL_FIELDS.map(({ fieldId }) => fieldId)).toEqual([
      "impianto.tipo",
      "impianto.terminali",
      "impianto.distribuzione",
      "impianto.regolazione",
      "impianto.combustibile",
      "impianto.condizionamento",
      "impianto.manutenzione",
    ]);
  });

  it("prepara i sei campi disponibili e non include il generatore", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const preparation = buildEneaPlantPortalScript(mapped);

    expect(preparation.readyFieldIds).toEqual([
      "impianto.tipo",
      "impianto.terminali",
      "impianto.distribuzione",
      "impianto.regolazione",
      "impianto.combustibile",
      "impianto.condizionamento",
    ]);
    expect(preparation.skippedFieldIds).toEqual(["impianto.manutenzione"]);
    expect(preparation.script).toContain('"portalId":"id-distribuzione","control":"select","value":"c. edifici');
    expect(preparation.script).not.toContain("impianto.generatore");
    expect(preparation.script).not.toMatch(/\.submit\s*\(/);
  });

  it("compila le scelte osservate e non attiva Salva", async () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const { script } = buildEneaPlantPortalScript(mapped);
    const dom = new JSDOM(`
      <form id="impianto-termico">
        <select id="id-impianto"><option value=""></option><option value="26">Autonomo</option><option value="27">Centralizzato</option></select>
        <select id="id-erogazione"><option value=""></option><option value="34">Radiatori</option><option value="36">Pannelli</option><option value="37">Altro</option></select>
        <select id="id-distribuzione"><option value=""></option><option value="40">C</option></select>
        <select id="id-regolazione"><option value=""></option><option value="44">Ad ambiente o zona</option></select>
        <select id="id-vettore"><option value=""></option><option value="45">Gas metano</option><option value="50">Energia elettrica</option></select>
        <select id="id-estivo"><option value=""></option><option value="S">Sì</option><option value="N">No</option></select>
        <textarea id="id-interventi"></textarea>
        <button id="salva" type="submit">Salva</button>
      </form>
    `, { runScripts: "outside-only", url: "https://bonusfiscali.enea.it/impianto-termico-esistente" });
    let submitCount = 0;
    dom.window.document.getElementById("impianto-termico")?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    const result = await dom.window.eval(script) as {
      compiled: string[];
      notFound: string[];
      notAvailable: string[];
    };

    expect((dom.window.document.getElementById("id-impianto") as HTMLSelectElement).value).toBe("26");
    expect((dom.window.document.getElementById("id-erogazione") as HTMLSelectElement).value).toBe("34");
    expect((dom.window.document.getElementById("id-distribuzione") as HTMLSelectElement).value).toBe("40");
    expect((dom.window.document.getElementById("id-regolazione") as HTMLSelectElement).value).toBe("44");
    expect((dom.window.document.getElementById("id-vettore") as HTMLSelectElement).value).toBe("45");
    expect((dom.window.document.getElementById("id-estivo") as HTMLSelectElement).value).toBe("S");
    expect(result.compiled).toHaveLength(6);
    expect(result.notFound).toEqual([]);
    expect(result.notAvailable).toEqual([]);
    expect(submitCount).toBe(0);
  });
});
