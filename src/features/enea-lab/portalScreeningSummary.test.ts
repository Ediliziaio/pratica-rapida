import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import {
  ENEA_LAB_MOCK_ANALYSIS,
  ENEA_LAB_MOCK_PRACTICES,
} from "./mockPractices";
import { buildEneaScreeningSummaryPortalScript } from "./portalScreeningSummary";

describe("compilazione riepilogo schermature ENEA", () => {
  it("prepara la spesa IVA compresa ricavata dalle fatture", async () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const { script, readyFieldIds } = buildEneaScreeningSummaryPortalScript(mapped);
    const dom = new JSDOM(`
      <form id="riepilogo">
        <input id="id-costo"><button type="submit">Salva</button>
      </form>
    `, { runScripts: "outside-only", url: "https://bonusfiscali.enea.it/schermature-solari" });
    let submitCount = 0;
    dom.window.document.getElementById("riepilogo")?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    const result = await dom.window.eval(script) as { compiled: string[] };

    expect(readyFieldIds).toEqual(["schermature.spesa"]);
    expect((dom.window.document.getElementById("id-costo") as HTMLInputElement).value).not.toBe("");
    expect(result.compiled).toEqual(["id-costo"]);
    expect(submitCount).toBe(0);
  });

  it("rifiuta placeholder e valori non numerici anche se il campo fosse marcato ready a monte", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const expense = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "schermature.spesa")!;

    for (const invalidValue of ["Non indicato", "Intervento umano richiesto", "testo", "-1 €"]) {
      expense.status = "ready";
      expense.value = invalidValue;
      const preparation = buildEneaScreeningSummaryPortalScript(mapped);
      expect(preparation.readyFieldIds).toEqual([]);
      expect(preparation.skippedFieldIds).toEqual(["schermature.spesa"]);
      expect(preparation.script).not.toContain(`\"value\":\"${invalidValue}\"`);
    }
  });
});
