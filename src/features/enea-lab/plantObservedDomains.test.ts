import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { validateOperatorOverride } from "./operatorValidation";
import { ENEA_PLANT_TERMINAL } from "./plantRules";
import { buildEneaPlantPortalScript } from "./portalPlant";

describe("domini impianto osservati sul portale ENEA 2026", () => {
  it("accetta i valori osservati che non richiedono campi Altro", () => {
    const cases: Array<[string, string]> = [
      ["impianto.tipo", "d. impianto centralizzato con più generatori di calore"],
      ["impianto.tipo", "e. impianto centralizzato con più generatori di calore e contabilizzazione del calore per singolo utente"],
      ["impianto.terminali", "a. termoconvettori"],
      ["impianto.terminali", "b. ventilconvettori"],
      ["impianto.terminali", "c. bocchette aria calda"],
      ["impianto.terminali", "e. pannelli radianti isolati dalle strutture"],
      ["impianto.distribuzione", "a. edifici a colonne montanti situate totalmente all'interno degli ambienti riscaldati"],
      ["impianto.distribuzione", "b. edifici a colonne montanti, non isolate termicamente, inserite all'interno delle pareti"],
      ["impianto.distribuzione", "d. edifici con distribuzione orizzontale o ad anello"],
      ["impianto.regolazione", "a. regolazione centralizzata"],
      ["impianto.regolazione", "b. regolazione su terminale di erogazione"],
      ["impianto.combustibile", "e. olio combustibile"],
      ["impianto.combustibile", "g. biomassa"],
    ];

    for (const [fieldId, value] of cases) {
      expect(validateOperatorOverride(fieldId, value)).toEqual({ valid: true, value });
    }
  });

  it("non tratta la voce generica Altro come terminale ufficiale verificabile", () => {
    expect(validateOperatorOverride("impianto.terminali", "g. altro").valid).toBe(false);
  });

  it("lascia lo split fail-closed invece di tradurlo automaticamente in Altro", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.impianto.terminali = "split";

    const mapped = mapSchermaturaPractice(source);
    const terminal = mapped.sections.flatMap((section) => section.fields)
      .find((field) => field.id === "impianto.terminali");
    expect(terminal).toMatchObject({
      value: "Intervento umano richiesto",
      source: "Regola controllata",
      status: "missing",
    });

    const reconciled = mapSchermaturaPractice(source, undefined, {
      overrides: { "impianto.terminali": ENEA_PLANT_TERMINAL.fanCoils },
    });
    expect(reconciled.sections.flatMap((section) => section.fields)
      .find((field) => field.id === "impianto.terminali")).toMatchObject({
      value: ENEA_PLANT_TERMINAL.fanCoils,
      source: "Inserimento operatore",
      status: "ready",
    });
  });

  it("lascia correggere distribuzione e regolazione nel laboratorio senza renderle automatiche", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const fields = mapped.sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "impianto.distribuzione")).toMatchObject({
      editable: true,
      source: "Regola controllata",
    });
    expect(fields.find((field) => field.id === "impianto.regolazione")).toMatchObject({
      editable: true,
      source: "Regola controllata",
    });
  });

  it("porta distribuzione e regolazione osservate nel workflow solo dopo override operatore", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      overrides: {
        "impianto.distribuzione": "a. edifici a colonne montanti situate totalmente all'interno degli ambienti riscaldati",
        "impianto.regolazione": "a. regolazione centralizzata",
      },
    });

    const fields = mapped.sections.flatMap((section) => section.fields);
    expect(fields.find((field) => field.id === "impianto.distribuzione")).toMatchObject({
      source: "Inserimento operatore",
      status: "ready",
    });
    expect(fields.find((field) => field.id === "impianto.regolazione")).toMatchObject({
      source: "Inserimento operatore",
      status: "ready",
    });

    const preparation = buildEneaPlantPortalScript(mapped);
    expect(preparation.runtime.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ portalId: "id-distribuzione", selectValue: "38" }),
      expect.objectContaining({ portalId: "id-regolazione", selectValue: "42" }),
    ]));
  });
});
