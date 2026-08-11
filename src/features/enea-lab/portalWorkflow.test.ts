import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import {
  ENEA_LAB_MOCK_ANALYSIS,
  ENEA_LAB_MOCK_PRACTICES,
} from "./mockPractices";
import { buildEneaPortalWorkflowScript } from "./portalWorkflow";

describe("comando unico ENEA", () => {
  it("riconosce la finestra in primo piano e non salva", async () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      includeTestConventions: true,
    });
    const preparation = buildEneaPortalWorkflowScript(mapped);
    const dom = new JSDOM(`
      <form id="impianto">
        <select id="id-impianto"></select><select id="id-erogazione"></select><select id="id-vettore"></select>
      </form>
      <form id="generatore">
        <input id="id-num"><input id="id-n"><input id="id-pn">
        <button type="submit">Salva</button>
      </form>
    `, { runScripts: "outside-only", url: "https://bonusfiscali.enea.it/impianto-termico-esistente" });
    let submitCount = 0;
    dom.window.document.getElementById("generatore")?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    const result = await dom.window.eval(preparation.script) as { step: string; compiled: string[] };

    expect(result.step).toBe("generator");
    expect(result.compiled).toEqual(["id-num", "id-n", "id-pn"]);
    expect(preparation.supportedPages).toContain("Schermature solari");
    expect(preparation.screeningItemCount).toBeGreaterThan(0);
    expect(preparation.script).not.toMatch(/\.submit\s*\(/);
    expect(submitCount).toBe(0);
  });

  it("si ferma prima di scrivere quando più pagine risultano compatibili", async () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      includeTestConventions: true,
    });
    const preparation = buildEneaPortalWorkflowScript(mapped);
    const dom = new JSDOM(`
      <form id="generatore">
        <input id="id-num"><input id="id-n"><input id="id-pn">
      </form>
      <form id="beneficiario">
        <input id="id-nome"><input id="id-codice_fiscale">
      </form>
    `, { runScripts: "outside-only", url: "https://bonusfiscali.enea.it/pratica" });

    await expect(dom.window.eval(preparation.script)).rejects.toThrow(
      /Riconoscimento pagina ENEA ambiguo/,
    );
    expect((dom.window.document.getElementById("id-num") as HTMLInputElement).value).toBe("");
    expect((dom.window.document.getElementById("id-nome") as HTMLInputElement).value).toBe("");
  });
});
