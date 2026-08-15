import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import {
  ENEA_LAB_MOCK_ANALYSIS,
  ENEA_LAB_MOCK_PRACTICES,
} from "./mockPractices";
import { buildEneaGeneratorPortalScript } from "./portalGenerator";

describe("compilazione finestra generatore ENEA", () => {
  it("usa i tre identificativi osservati e mantiene i valori di prova separati", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      includeTestConventions: true,
    });

    expect(buildEneaGeneratorPortalScript(mapped).readyFieldIds).toEqual([]);
    expect(buildEneaGeneratorPortalScript(mapped, true).readyFieldIds).toEqual([
      "impianto.numero_generatori",
      "impianto.rendimento",
      "impianto.potenza",
    ]);
  });

  it("rifiuta valori numerici non validi anche se arrivano da una correzione locale", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      includeTestConventions: true,
      overrides: {
        "impianto.numero_generatori": "0",
        "impianto.rendimento": "0",
        "impianto.potenza": "0",
      },
    });

    expect(buildEneaGeneratorPortalScript(mapped, true).readyFieldIds).toEqual([]);
    expect(buildEneaGeneratorPortalScript(mapped).readyFieldIds).toEqual([]);
  });

  it("non concatena piu numeri in un valore ready quando il builder viene invocato direttamente", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const power = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "impianto.potenza");

    expect(power).toBeDefined();
    if (!power) throw new Error("Campo potenza assente");
    power.value = "25 x 2 kW";
    power.status = "ready";
    power.testOnly = false;

    const prepared = buildEneaGeneratorPortalScript(mapped);

    expect(prepared.readyFieldIds).not.toContain("impianto.potenza");
    expect(prepared.skippedFieldIds).toContain("impianto.potenza");
    expect(prepared.runtime.fields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ portalId: "id-pn", value: "252" })]),
    );
  });

  it("compila la finestra aperta senza premere Salva", async () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      includeTestConventions: true,
    });
    const { script } = buildEneaGeneratorPortalScript(mapped, true);
    const dom = new JSDOM(`
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

    const result = await dom.window.eval(script) as { compiled: string[] };

    expect((dom.window.document.getElementById("id-num") as HTMLInputElement).value).toBe("1");
    expect(Number((dom.window.document.getElementById("id-n") as HTMLInputElement).value.replace(",", "."))).toBeGreaterThan(0);
    expect(Number((dom.window.document.getElementById("id-pn") as HTMLInputElement).value.replace(",", "."))).toBeGreaterThan(0);
    expect(result.compiled).toEqual(["id-num", "id-n", "id-pn"]);
    expect(submitCount).toBe(0);
  });
});
