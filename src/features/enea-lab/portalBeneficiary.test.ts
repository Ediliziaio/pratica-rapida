import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import {
  ENEA_BENEFICIARY_PORTAL_FIELDS,
  buildEneaBeneficiaryPortalScript,
} from "./portalBeneficiary";

describe("compilazione pagina beneficiario ENEA", () => {
  it("consegna nome, provincia e codice ISTAT canonici per la residenza", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.residenza.comune = "MONTECOMPATRI (RM)";
    source.form.residenza.provincia = "ROMA";
    const preparation = buildEneaBeneficiaryPortalScript(mapSchermaturaPractice(source));
    expect(preparation.runtime.fields).toEqual(expect.arrayContaining([expect.objectContaining({
      portalId: "id-comune_residenza",
      value: "Monte Compatri",
      autocompleteQualifier: "RM",
      autocompleteAuthoritativeIstatCode: "058060",
    })]));
  });

  it("consegna al widget ENEA il nome corrente e la sigla ufficiale per Godiasco", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.cf = "RNZRND49B18E072J";
    source.form.richiedente.data_nascita = "1949-02-18";
    source.form.richiedente.comune_nascita = "Godiasco";
    source.form.richiedente.provincia_nascita = "Pavia";
    const preparation = buildEneaBeneficiaryPortalScript(mapSchermaturaPractice(source));

    expect(preparation.runtime.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        portalId: "id-comune_nascita",
        control: "autocomplete",
        value: "Godiasco Salice Terme",
        autocompleteQualifier: "PV",
      }),
    ]));
  });

  it("sostituisce la provincia storica soltanto tramite la linea ISTAT ufficiale", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.cf = "RSSMRA80A01H501U";
    source.form.richiedente.data_nascita = "1980-01-01";
    source.form.richiedente.comune_nascita = "La Maddalena";
    source.form.richiedente.provincia_nascita = "SS";
    const preparation = buildEneaBeneficiaryPortalScript(mapSchermaturaPractice(source));

    expect(preparation.runtime.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        portalId: "id-comune_nascita",
        value: "La Maddalena",
        autocompleteQualifier: "OT",
        autocompleteAuthoritativeIstatCode: "113012",
      }),
    ]));
  });

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
    source.form.richiedente.provincia_nascita = "RM";
    source.form.residenza.provincia = "RM";
    const mapped = mapSchermaturaPractice(source);
    const preparation = buildEneaBeneficiaryPortalScript(mapped);

    expect(preparation.readyFieldIds).toEqual(expect.arrayContaining([
      "beneficiario.nome",
      "beneficiario.cf",
      "beneficiario.nazione_nascita",
      "beneficiario.nazione_residenza",
      "beneficiario.cap_residenza",
    ]));
    expect(preparation.script).toContain('"portalId":"id-nome"');
    expect(preparation.runtime.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ portalId: "id-nazione_nascita", value: "Italia", selectValue: "ita" }),
      expect.objectContaining({ portalId: "id-comune_nascita", value: source.form.richiedente.comune_nascita, autocompleteQualifier: "RM" }),
      expect.objectContaining({ portalId: "id-nazione_residenza", value: "Italia", selectValue: "ita" }),
    ]));
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

  it("tratta il luogo di nascita estero come testo libero e conserva l'autocomplete per i Comuni italiani", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.cf = "SKLKRZ81D47Z127F";
    source.form.richiedente.comune_nascita = "Tychy";
    source.form.richiedente.provincia_nascita = "EE";
    source.form.residenza.provincia = "PD";
    const mapped = mapSchermaturaPractice(source);
    const preparation = buildEneaBeneficiaryPortalScript(mapped);

    expect(preparation.runtime.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ portalId: "id-nazione_nascita", value: "Polonia", selectValue: "pol" }),
      expect.objectContaining({ portalId: "id-comune_nascita", control: "input", value: "Tychy" }),
      expect.objectContaining({ portalId: "id-comune_residenza", control: "autocomplete" }),
    ]));
  });

  it("seleziona una nazione estera dal codice ISO3 ANPR anche quando l'etichetta ENEA differisce", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.nome = "Kitenge";
    source.form.richiedente.cognome = "Ebambi";
    source.form.richiedente.cf = "BMBKNG66R44Z312Y";
    source.form.richiedente.data_nascita = "1966-10-04";
    source.form.richiedente.comune_nascita = "Lubumbashi COD";
    source.form.richiedente.provincia_nascita = "EE";
    const preparation = buildEneaBeneficiaryPortalScript(mapSchermaturaPractice(source));

    expect(preparation.runtime.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ portalId: "id-nazione_nascita", selectValue: "cod" }),
      expect.objectContaining({ portalId: "id-comune_nascita", control: "input", value: "Lubumbashi COD" }),
    ]));
  });

  it("non prepara placeholder interni anche se il dato sorgente risulta formalmente valorizzato", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.nome = "Non indicato";
    const mapped = mapSchermaturaPractice(source);
    const preparation = buildEneaBeneficiaryPortalScript(mapped);

    expect(preparation.skippedFieldIds).toContain("beneficiario.nome");
    expect(preparation.readyFieldIds).not.toContain("beneficiario.nome");
    expect(preparation.script).not.toContain("Non indicato");
  });

  it("prepara il contratto semantico dell'altro beneficiario persona fisica senza salvarlo nello script manuale", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.cointestazione = { presente: true, nome: "Maria Giovanna Angela", cognome: "Pinna", cf: "PNNMGV84B43G203G" };
    const mapped = mapSchermaturaPractice(source);
    for (const field of mapped.sections.flatMap((section) => section.fields).filter((field) => field.id.startsWith("beneficiario.cointestatario"))) {
      field.source = "Fattura"; field.appliedRuleIds = ["user-2026-08-17-invoice-co-beneficiary-person-flow"];
    }
    const preparation = buildEneaBeneficiaryPortalScript(mapped);
    expect(preparation.runtime.coBeneficiary).toEqual({
      name: "Maria Giovanna Angela", surname: "Pinna", taxCode: "PNNMGV84B43G203G", sourceIds: ["Fattura"], appliedRuleIds: ["user-2026-08-17-invoice-co-beneficiary-person-flow"],
    });
    expect(preparation.readyFieldIds).toEqual(expect.arrayContaining(["beneficiario.cointestatario_nome", "beneficiario.cointestatario_cognome", "beneficiario.cointestatario_cf"]));
    expect(preparation.script).not.toMatch(/\.click\s*\(/);
  });

  it("compila input, select e Comuni in una pagina equivalente senza attivare Salva", async () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.cf = "RSSMRA80A01H501U";
    source.form.richiedente.provincia_nascita = "RM";
    source.form.residenza.provincia = "RM";
    const mapped = mapSchermaturaPractice(source);
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
      <ul class="ui-autocomplete"></ul>
    `, {
      runScripts: "outside-only",
      url: "https://bonusfiscali.enea.it/beneficiario",
    });
    let submitCount = 0;
    const list = dom.window.document.querySelector(".ui-autocomplete")!;
    for (const id of ["id-comune_nascita", "id-comune_residenza"]) {
      const input = dom.window.document.getElementById(id) as HTMLInputElement;
      input.addEventListener("input", () => {
        list.innerHTML = `<li><a>Comune Demo Nord (ZZ)</a></li>`;
        list.querySelector("a")?.addEventListener("click", () => { input.value = "Comune Demo Nord"; });
      });
    }
    dom.window.document.getElementById("beneficiario")?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    const result = await dom.window.eval(script) as { compiled: string[] };

    expect((dom.window.document.getElementById("id-nome") as HTMLInputElement).value).toBe("Cliente");
    expect((dom.window.document.getElementById("id-codice_fiscale") as HTMLInputElement).value).toBe("RSSMRA80A01H501U");
    expect((dom.window.document.getElementById("id-nazione_nascita") as HTMLSelectElement).value).toBe("ita");
    expect((dom.window.document.getElementById("id-cap_residenza") as HTMLInputElement).value).toBe("00001");
    expect(result.compiled).toContain("id-telefono");
    expect(submitCount).toBe(0);
  });
});
