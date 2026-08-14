import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import {
  ENEA_LAB_MOCK_ANALYSIS,
  ENEA_LAB_MOCK_PRACTICES,
} from "./mockPractices";
import {
  ENEA_SCREENING_PORTAL_FIELDS,
  buildEneaScreeningPortalScript,
} from "./portalScreening";

describe("compilazione finestra schermatura solare ENEA", () => {
  it("mappa tutti i controlli osservati, compresa la Rsupp", () => {
    expect(ENEA_SCREENING_PORTAL_FIELDS.map(({ fieldSuffix }) => fieldSuffix)).toEqual([
      "tipo",
      "installazione",
      "superficie",
      "superficie_finestrata",
      "rsupp",
      "esposizione",
      "modalita_calcolo",
      "gtot",
      "materiale",
      "regolazione",
    ]);
  });

  it("non compila Rsupp finché non è stata verificata dall'operatore", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const preparation = buildEneaScreeningPortalScript(mapped, 0);

    expect(preparation.readyFieldIds).toEqual([
      "schermature.0.tipo",
      "schermature.0.installazione",
      "schermature.0.superficie",
      "schermature.0.esposizione",
      "schermature.0.modalita_calcolo",
      "schermature.0.gtot",
      "schermature.0.materiale",
      "schermature.0.regolazione",
    ]);
    expect(preparation.skippedFieldIds).toEqual([
      "schermature.0.superficie_finestrata",
      "schermature.0.rsupp",
    ]);
    expect(preparation.script).toContain('"portalId":"id-tipo","control":"select","value":"Tenda o veneziana","selectValue":"127"');
    expect(preparation.script).toContain('"portalId":"id-inst","control":"select","value":"Esterna","selectValue":"192"');
    expect(preparation.script).toContain('"portalId":"id-calc","control":"select","value":"Dichiarato dal fornitore","selectValue":"193"');
    expect(preparation.script).not.toContain("id-rsup");
    expect(preparation.script).not.toMatch(/\.submit\s*\(/);
  });

  it("compila una Rsupp verificata senza attivare Salva", async () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      overrides: {
        "schermature.0.superficie_finestrata": "2,9 m²",
        "schermature.0.rsupp": "0,12",
      },
    });
    const { script } = buildEneaScreeningPortalScript(mapped, 0);
    const dom = new JSDOM(`
      <form id="schermatura">
        <select id="id-tipo"><option value=""></option><option value="127">Tenda</option><option value="169">Altra</option></select>
        <select id="id-inst"><option value=""></option><option value="192">Esterna</option></select>
        <input id="id-sup_s"><input id="id-sup_f"><input id="id-rsup">
        <select id="id-esp"><option value=""></option><option value="132">Sud</option></select>
        <select id="id-calc"><option value=""></option><option value="193">Dichiarato</option></select>
        <input id="id-gtot">
        <select id="id-mat"><option value=""></option><option value="136">Tessuto</option></select>
        <select id="id-mec"><option value=""></option><option value="143">Manuale</option></select>
        <button id="salva" type="submit">Salva</button>
      </form>
    `, { runScripts: "outside-only", url: "https://bonusfiscali.enea.it/schermature-solari" });
    let submitCount = 0;
    dom.window.document.getElementById("schermatura")?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    const result = await dom.window.eval(script) as { compiled: string[] };

    expect((dom.window.document.getElementById("id-tipo") as HTMLSelectElement).value).toBe("127");
    expect((dom.window.document.getElementById("id-inst") as HTMLSelectElement).value).toBe("192");
    expect((dom.window.document.getElementById("id-sup_s") as HTMLInputElement).value).toBe("3,7");
    expect((dom.window.document.getElementById("id-sup_f") as HTMLInputElement).value).toBe("2,9");
    expect((dom.window.document.getElementById("id-rsup") as HTMLInputElement).value).toBe("0,12");
    expect((dom.window.document.getElementById("id-calc") as HTMLSelectElement).value).toBe("193");
    expect((dom.window.document.getElementById("id-gtot") as HTMLInputElement).value).toBe("0,13");
    expect(result.compiled).toHaveLength(10);
    expect(submitCount).toBe(0);
  });
});
