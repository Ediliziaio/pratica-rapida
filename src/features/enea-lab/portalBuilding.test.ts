import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import {
  ENEA_BUILDING_PORTAL_FIELDS,
  buildEneaBuildingPortalScript,
} from "./portalBuilding";

describe("compilazione pagina immobile ENEA", () => {
  it("consegna nome, provincia e codice ISTAT canonici per il Comune lavori", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.residenza.comune = "MONTECOMPATRI (RM)";
    source.form.residenza.provincia = "ROMA";
    source.form.residenza.stesso_indirizzo_lavori = true;
    const preparation = buildEneaBuildingPortalScript(mapSchermaturaPractice(source));
    expect(preparation.runtime.fields).toEqual(expect.arrayContaining([expect.objectContaining({
      portalId: "id-comune",
      value: "Monte Compatri",
      autocompleteQualifier: "RM",
      autocompleteAuthoritativeIstatCode: "058060",
    })]));
  });

  it("consegna a ENEA provincia e codice correnti quando il Comune lavori usa una sigla storica", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.residenza.comune = "Trinità d’Agultu e Vignola";
    source.form.residenza.provincia = "SS";
    source.form.residenza.stesso_indirizzo_lavori = true;
    const preparation = buildEneaBuildingPortalScript(mapSchermaturaPractice(source));
    expect(preparation.runtime.fields).toEqual(expect.arrayContaining([expect.objectContaining({
      portalId: "id-comune",
      value: "Trinità d'Agultu e Vignola",
      autocompleteQualifier: "OT",
      autocompleteAuthoritativeIstatCode: "113026",
    })]));
  });

  it("non converte una provincia estranea al lignaggio ufficiale del Comune lavori", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.residenza.comune = "Trinità d’Agultu e Vignola";
    source.form.residenza.provincia = "NU";
    source.form.residenza.stesso_indirizzo_lavori = true;
    const preparation = buildEneaBuildingPortalScript(mapSchermaturaPractice(source));
    expect(preparation.runtime.fields).toEqual(expect.arrayContaining([expect.objectContaining({
      portalId: "id-comune",
      value: "Trinità d’Agultu e Vignola",
      autocompleteQualifier: "NU",
    })]));
    expect(preparation.runtime.fields).not.toEqual(expect.arrayContaining([expect.objectContaining({
      portalId: "id-comune",
      autocompleteAuthoritativeIstatCode: expect.any(String),
    })]));
  });

  it("mappa i 18 identificativi osservati sul portale 2026", () => {
    expect(ENEA_BUILDING_PORTAL_FIELDS.map(({ portalId }) => portalId)).toEqual([
      "id-comune", "id-indirizzo", "id-civico", "id-cap", "id-scala", "id-interno",
      "id-gg", "id-sezione", "id-foglio", "id-mappale", "id-sub", "id-anno",
      "id-sup_utile", "id-unita", "id-possesso", "id-destinazione_uso", "id-dpr412",
      "id-tipologia",
    ]);
    expect(ENEA_BUILDING_PORTAL_FIELDS.find(({ portalId }) => portalId === "id-gg"))
      .toMatchObject({ automatic: true });
  });

  it("prepara solo valori verificati e usa i codici reali delle select", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], undefined, {
      confirmedFieldIds: new Set([
        "immobile.destinazione_generale",
        "immobile.destinazione_particolare",
      ]),
    });
    const preparation = buildEneaBuildingPortalScript(mapped);

    expect(preparation.readyFieldIds).toEqual(expect.arrayContaining([
      "immobile.comune",
      "immobile.indirizzo",
      "immobile.foglio",
      "beneficiario.titolo",
      "immobile.destinazione_generale",
      "immobile.destinazione_particolare",
      "immobile.tipologia",
    ]));
    expect(preparation.skippedFieldIds).toEqual(expect.arrayContaining([
      "immobile.scala",
      "immobile.interno",
      "immobile.gradi_giorno",
      "immobile.sezione",
    ]));
    expect(preparation.script).not.toContain('"portalId":"id-gg"');
    expect(preparation.script).toContain('"portalId":"id-possesso","control":"select","value":"Proprietario / comproprietario","selectValue":"1"');
    expect(preparation.script).toContain('"portalId":"id-tipologia","control":"select","value":"Casa singola o plurifamiliare","selectValue":"18"');
    expect(preparation.script).not.toMatch(/\.submit\s*\(/);
  });

  it("seleziona il Comune, compila i dati e non attiva Salva", async () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], undefined, {
      confirmedFieldIds: new Set([
        "immobile.destinazione_generale",
        "immobile.destinazione_particolare",
      ]),
    });
    const { script } = buildEneaBuildingPortalScript(mapped);
    const dom = new JSDOM(`
      <form id="immobile">
        <input id="id-comune"><input id="id-indirizzo"><input id="id-civico"><input id="id-cap">
        <input id="id-scala"><input id="id-interno"><select id="id-gg"><option value="">-</option></select>
        <input id="id-sezione"><input id="id-foglio"><input id="id-mappale"><input id="id-sub">
        <input id="id-anno"><input id="id-sup_utile"><input id="id-unita">
        <select id="id-possesso"><option value=""></option><option value="1">Proprietario o comproprietario</option></select>
        <select id="id-destinazione_uso"><option value=""></option><option value="5">Residenziale</option></select>
        <select id="id-dpr412"><option value=""></option><option value="8">Residenza</option></select>
        <select id="id-tipologia"><option value=""></option><option value="18">Costruzione isolata</option></select>
        <button id="salva" type="submit">Salva</button>
      </form>
      <ul class="ui-autocomplete"></ul>
    `, { runScripts: "outside-only", url: "https://bonusfiscali.enea.it/immobile" });
    const comune = dom.window.document.getElementById("id-comune") as HTMLInputElement;
    const list = dom.window.document.querySelector(".ui-autocomplete")!;
    comune.addEventListener("input", () => {
      list.innerHTML = `<li><a>Comune Demo Nord (ZZ)</a></li>`;
      list.querySelector("a")?.addEventListener("click", () => { comune.value = "Comune Demo Nord"; });
    });
    let submitCount = 0;
    dom.window.document.getElementById("immobile")?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    const result = await dom.window.eval(script) as { compiled: string[]; notSelected: string[] };

    expect(comune.value).toBe("Comune Demo Nord");
    expect((dom.window.document.getElementById("id-indirizzo") as HTMLInputElement).value).toBe("Via Laboratorio");
    expect((dom.window.document.getElementById("id-sup_utile") as HTMLInputElement).value).toBe("112");
    expect((dom.window.document.getElementById("id-possesso") as HTMLSelectElement).value).toBe("1");
    expect((dom.window.document.getElementById("id-tipologia") as HTMLSelectElement).value).toBe("18");
    expect(result.compiled).toContain("id-comune");
    expect(result.notSelected).toEqual([]);
    expect(submitCount).toBe(0);
  });

  it("porta la provincia documentata come qualificatore dell'autocomplete Comune", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], undefined, {
      confirmedFieldIds: new Set([
        "immobile.destinazione_generale",
        "immobile.destinazione_particolare",
      ]),
    });
    const preparation = buildEneaBuildingPortalScript(mapped);
    expect(preparation.runtime.fields).toContainEqual(expect.objectContaining({
      portalId: "id-comune",
      autocompleteQualifier: "ZZ",
    }));
  });
});
