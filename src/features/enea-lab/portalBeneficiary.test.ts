import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import {
  ENEA_BENEFICIARY_PORTAL_FIELDS,
  buildEneaBeneficiaryPortalScript,
} from "./portalBeneficiary";

describe("compilazione pagina beneficiario ENEA", () => {
  it("usa gli identificativi osservati sul portale 2026 senza azioni di salvataggio", () => {
    expect(ENEA_BENEFICIARY_PORTAL_FIELDS.map(({ portalId }) => portalId)).toEqual([
      "id-nome",
      "id-cognome",
      "id-codice_fiscale",
      "id-data_nascita",
      "id-sesso",
      "id-nazione_nascita",
      "id-comune_nascita",
      "id-nazione_residenza",
      "id-comune_residenza",
      "id-indirizzo_residenza",
      "id-civico_residenza",
      "id-cap_residenza",
      "id-telefono",
    ]);

    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.cf = "RSSMRA80A01H501U";
    const mapped = mapSchermaturaPractice(source, undefined, {
      confirmedFieldIds: new Set([
        "beneficiario.nazione_nascita",
        "beneficiario.nazione_residenza",
      ]),
    });
    const preparation = buildEneaBeneficiaryPortalScript(mapped);

    expect(preparation.readyFieldIds).toEqual(expect.arrayContaining([
      "beneficiario.nome",
      "beneficiario.cf",
      "beneficiario.nazione_nascita",
      "beneficiario.nazione_residenza",
      "beneficiario.cap_residenza",
    ]));
    expect(preparation.script).toContain('"portalId":"id-nome"');
    expect(preparation.script).toContain('"portalId":"id-nazione_nascita","control":"select","value":"Italia"');
    expect(preparation.script).not.toContain("Intervento umano richiesto");
    expect(preparation.script).not.toMatch(/\.click\s*\(/);
    expect(preparation.script).not.toMatch(/\.submit\s*\(/);
  });

  it("esclude dalla compilazione automatica i dati non verificati", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const preparation = buildEneaBeneficiaryPortalScript(mapped);

    expect(preparation.skippedFieldIds).toEqual(expect.arrayContaining([
      "beneficiario.cf",
      "beneficiario.nazione_nascita",
      "beneficiario.nazione_residenza",
    ]));
    expect(preparation.script).not.toContain("CF-DEMO-001-NON-VALIDO");
  });

  it("compila input e select in una pagina equivalente senza attivare Salva", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.cf = "RSSMRA80A01H501U";
    const mapped = mapSchermaturaPractice(source, undefined, {
      confirmedFieldIds: new Set([
        "beneficiario.nazione_nascita",
        "beneficiario.nazione_residenza",
      ]),
    });
    const { script } = buildEneaBeneficiaryPortalScript(mapped);
    const dom = new JSDOM(`
      <form id="beneficiario">
        <input id="id-nome">
        <input id="id-cognome">
        <input id="id-codice_fiscale">
        <input id="id-data_nascita">
        <select id="id-sesso"><option value=""></option><option value="M">M</option><option value="F">F</option></select>
        <select id="id-nazione_nascita"><option value="ita">Italia</option></select>
        <input id="id-comune_nascita">
        <select id="id-nazione_residenza"><option value="ita">Italia</option></select>
        <input id="id-comune_residenza">
        <input id="id-indirizzo_residenza">
        <input id="id-civico_residenza">
        <input id="id-cap_residenza">
        <input id="id-telefono">
        <button id="salva" type="submit">Salva</button>
      </form>
    `, {
      runScripts: "outside-only",
      url: "https://bonusfiscali.enea.it/beneficiario",
    });
    let submitCount = 0;
    dom.window.document.getElementById("beneficiario")?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    const result = dom.window.eval(script) as { compiled: string[] };

    expect((dom.window.document.getElementById("id-nome") as HTMLInputElement).value).toBe("Cliente");
    expect((dom.window.document.getElementById("id-codice_fiscale") as HTMLInputElement).value).toBe("RSSMRA80A01H501U");
    expect((dom.window.document.getElementById("id-nazione_nascita") as HTMLSelectElement).value).toBe("ita");
    expect((dom.window.document.getElementById("id-cap_residenza") as HTMLInputElement).value).toBe("00001");
    expect(result.compiled).toContain("id-telefono");
    expect(submitCount).toBe(0);
  });
});
