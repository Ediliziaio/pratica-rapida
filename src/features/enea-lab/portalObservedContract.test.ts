import { describe, expect, it } from "vitest";
import { ENEA_BUILDING_PORTAL_FIELDS } from "./portalBuilding";
import { ENEA_INTERVENTION_PORTAL_FIELDS } from "./portalIntervention";
import { ENEA_PLANT_PORTAL_FIELDS } from "./portalPlant";
import { ENEA_SCREENING_PORTAL_FIELDS } from "./portalScreening";

/**
 * Contratto ricavato dagli snapshot DOM del portale ENEA 2026 conservati
 * durante il collaudo. Se uno di questi ID cambia, il laboratorio deve essere
 * riverificato sul portale prima di aggiornare il test.
 */
describe("contratto osservato portale ENEA 2026", () => {
  it("congela gli ID dell'immobile", () => {
    expect(ENEA_BUILDING_PORTAL_FIELDS.map(({ portalId }) => portalId)).toEqual([
      "id-comune",
      "id-indirizzo",
      "id-civico",
      "id-cap",
      "id-scala",
      "id-interno",
      "id-gg",
      "id-sezione",
      "id-foglio",
      "id-mappale",
      "id-sub",
      "id-anno",
      "id-sup_utile",
      "id-unita",
      "id-possesso",
      "id-destinazione_uso",
      "id-dpr412",
      "id-tipologia",
    ]);
  });

  it("congela gli ID dell'intervento", () => {
    expect(ENEA_INTERVENTION_PORTAL_FIELDS.map(({ portalId, portalIds }) =>
      portalId ?? Object.values(portalIds ?? {}).join("|"),
    )).toEqual([
      "id-immobile",
      "id-unita",
      "id-acc",
      "id-data_inizio",
      "id-data_fine",
      "id-comma-345a|id-comma-345b|id-comma-347a",
      "id-impianto_centralizzato",
      "id-zona_urbanistica",
    ]);
  });

  it("congela gli ID dell'impianto termico", () => {
    expect(ENEA_PLANT_PORTAL_FIELDS.map(({ portalId }) => portalId)).toEqual([
      "id-impianto",
      "id-erogazione",
      "id-distribuzione",
      "id-regolazione",
      "id-vettore",
      "id-estivo",
      "id-interventi",
    ]);
  });

  it("congela gli ID della schermatura", () => {
    expect(ENEA_SCREENING_PORTAL_FIELDS.map(({ portalId }) => portalId)).toEqual([
      "id-tipo",
      "id-inst",
      "id-sup_s",
      "id-sup_f",
      "id-esp",
      "id-calc",
      "id-gtot",
      "id-mat",
      "id-mec",
    ]);
  });
});
