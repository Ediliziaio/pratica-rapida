import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildEneaPortalRuntimeScript } from "./portalScript";

describe("runtime ENEA textarea", () => {
  it("compila textarea come id-interventi senza attivare Salva", async () => {
    const script = buildEneaPortalRuntimeScript({
      fields: [{
        portalId: "id-interventi",
        control: "input",
        value: "Manutenzione verificata",
      }],
      pageName: "Impianto termico esistente",
      markerIds: ["id-impianto", "id-erogazione", "id-vettore"],
      successMessage: "Test",
    });
    const dom = new JSDOM(`
      <form id="impianto">
        <select id="id-impianto"></select>
        <select id="id-erogazione"></select>
        <select id="id-vettore"></select>
        <textarea id="id-interventi"></textarea>
        <button type="submit">Salva</button>
      </form>
    `, { runScripts: "outside-only", url: "https://bonusfiscali.enea.it/impianto-termico-esistente" });
    let submitCount = 0;
    dom.window.document.getElementById("impianto")?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    const result = await dom.window.eval(script) as { compiled: string[] };

    expect((dom.window.document.getElementById("id-interventi") as HTMLTextAreaElement).value)
      .toBe("Manutenzione verificata");
    expect(result.compiled).toEqual(["id-interventi"]);
    expect(submitCount).toBe(0);
  });
});
