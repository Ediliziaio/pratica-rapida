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
import { USER_AUTHORIZED_RULE_IDS } from "../enea-shadow-crm/operationalRegistry";

describe("compilazione finestra schermatura solare ENEA", () => {
  it("mappa tutti i controlli, inclusa la Rsupp richiesta per le persiane", () => {
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

  it("prepara i valori osservati e lascia fuori solo la superficie finestrata mancante", () => {
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
    expect(preparation.skippedFieldIds).toEqual(["schermature.0.superficie_finestrata", "schermature.0.rsupp"]);
    expect(preparation.script).toContain('"portalId":"id-tipo","control":"select","value":"Tenda o veneziana","selectValue":"127"');
    expect(preparation.script).toContain('"portalId":"id-inst","control":"select","value":"Esterna","selectValue":"192"');
    expect(preparation.script).toContain('"portalId":"id-calc","control":"select","value":"Dichiarato dal fornitore","selectValue":"193"');
    expect(preparation.script).not.toContain("id-rsup");
    expect(preparation.script).not.toMatch(/\.submit\s*\(/);
  });

  it("prepara e seleziona la tipologia Persiana tramite etichetta senza inventare un codice portale", async () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const typeField = mapped.sections.flatMap((section) => section.fields).find((field) => field.id === "schermature.0.tipo")!;
    typeField.value = "Persiana";
    const rsuppField = mapped.sections.flatMap((section) => section.fields).find((field) => field.id === "schermature.0.rsupp")!;
    rsuppField.value = "0,17";
    rsuppField.status = "ready";
    rsuppField.source = "Regola controllata";
    rsuppField.appliedRuleIds = [USER_AUTHORIZED_RULE_IDS.persianaScreening];
    const preparation = buildEneaScreeningPortalScript(mapped, 0);
    expect(preparation.readyFieldIds).toContain("schermature.0.tipo");
    expect(preparation.readyFieldIds).toContain("schermature.0.rsupp");
    expect(preparation.script).toContain('"portalId":"id-tipo","control":"select","value":"Persiana"');
    expect(preparation.script).not.toContain('"value":"Persiana","selectValue"');
    const dom = new JSDOM(`
      <select id="id-tipo"><option value=""></option><option value="portal-observed-at-runtime">Persiana</option></select>
      <select id="id-inst"><option value="192">Esterna</option></select>
      <input id="id-sup_s"><input id="id-sup_f"><input id="id-rsup">
      <select id="id-esp"><option value="132">Sud</option></select>
      <select id="id-calc"><option value="193">Dichiarato dal fornitore</option></select>
      <input id="id-gtot"><select id="id-mat"><option value="136">Tessuto</option></select>
      <select id="id-mec"><option value="143">Manuale</option></select>
    `, { runScripts: "outside-only", url: "https://bonusfiscali.enea.it/schermature-solari" });
    const result = await dom.window.eval(preparation.script) as { compiled: string[] };
    expect((dom.window.document.getElementById("id-tipo") as HTMLSelectElement).value).toBe("portal-observed-at-runtime");
    expect((dom.window.document.getElementById("id-rsup") as HTMLInputElement).value).toBe("0,17");
    expect(result.compiled).toContain("id-tipo");
  });

  it("seleziona Persiane avvolgibili tramite l'etichetta esatta e compila Rsupp 0,17", async () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const fields = mapped.sections.flatMap((section) => section.fields);
    const typeField = fields.find((field) => field.id === "schermature.0.tipo")!;
    typeField.value = "Persiane avvolgibili";
    const rsuppField = fields.find((field) => field.id === "schermature.0.rsupp")!;
    rsuppField.value = "0,17";
    rsuppField.status = "ready";
    rsuppField.source = "Regola controllata";
    rsuppField.appliedRuleIds = [USER_AUTHORIZED_RULE_IDS.avvolgibileScreening];
    const preparation = buildEneaScreeningPortalScript(mapped, 0);
    expect(preparation.script).toContain('"portalId":"id-tipo","control":"select","value":"Persiane avvolgibili"');
    expect(preparation.script).not.toContain('"value":"Persiane avvolgibili","selectValue"');
    const dom = new JSDOM(`
      <select id="id-tipo"><option value=""></option><option value="portal-avvolgibile">Persiane avvolgibili</option></select>
      <select id="id-inst"><option value="192">Esterna</option></select>
      <input id="id-sup_s"><input id="id-sup_f"><input id="id-rsup">
      <select id="id-esp"><option value="132">Sud</option></select>
      <select id="id-calc"><option value="193">Dichiarato dal fornitore</option></select>
      <input id="id-gtot"><select id="id-mat"><option value="136">Tessuto</option></select>
      <select id="id-mec"><option value="143">Manuale</option></select>
    `, { runScripts: "outside-only", url: "https://bonusfiscali.enea.it/schermature-solari" });
    await dom.window.eval(preparation.script);
    expect((dom.window.document.getElementById("id-tipo") as HTMLSelectElement).value).toBe("portal-avvolgibile");
    expect((dom.window.document.getElementById("id-rsup") as HTMLInputElement).value).toBe("0,17");
  });

  it("compila la finestra senza attivare Salva", async () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      overrides: { "schermature.0.superficie_finestrata": "2,9 m²" },
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
    expect((dom.window.document.getElementById("id-rsup") as HTMLInputElement).value).toBe("");
    expect((dom.window.document.getElementById("id-calc") as HTMLSelectElement).value).toBe("193");
    expect((dom.window.document.getElementById("id-gtot") as HTMLInputElement).value).toBe("0,13");
    expect(result.compiled).toHaveLength(9);
    expect(submitCount).toBe(0);
  });

  it("include il gTot fallback soltanto con una regola autorizzata e include i valori TEST autorizzati", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      includeTestConventions: true,
      overrides: { "schermature.0.superficie_finestrata": "2,9 m²" },
      resolvedScreeningGTot: [{
        value: 0.33,
        source: "authorized_fallback",
        ruleId: "user-2026-08-14-tenda-screening-gtot-033-fallback",
      }],
    });
    const preparation = buildEneaScreeningPortalScript(mapped, 0, true);
    expect(preparation.readyFieldIds).toContain("schermature.0.gtot");
    expect(preparation.readyFieldIds).toContain("schermature.0.superficie_finestrata");

    const gtot = mapped.sections.flatMap(({ fields }) => fields).find(({ id }) => id === "schermature.0.gtot");
    if (!gtot) throw new Error("fixture gTot mancante");
    gtot.appliedRuleIds = ["core-mapping-complete"];
    expect(buildEneaScreeningPortalScript(mapped, 0, true).readyFieldIds).not.toContain("schermature.0.gtot");
  });
});
