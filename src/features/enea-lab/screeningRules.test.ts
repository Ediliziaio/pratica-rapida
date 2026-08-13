import { describe, expect, it } from "vitest";
import {
  ENEA_SCREENING_MATERIAL,
  ENEA_SCREENING_REGULATION,
  ENEA_SCREENING_TYPE,
  screeningRules,
} from "./screeningRules";

describe("regole operative schermature solari", () => {
  it("mappa una tenda da sole in tessuto e usa il gTot documentato", () => {
    expect(screeningRules("tende_da_sole", "Tenda da sole", 0.13)).toMatchObject({
      type: ENEA_SCREENING_TYPE.awning,
      gTot: 0.13,
      gTotFromDocument: true,
      material: ENEA_SCREENING_MATERIAL.fabric,
      regulation: ENEA_SCREENING_REGULATION.manual,
    });
  });

  it("riconosce motore e PVC dalla descrizione della tenda", () => {
    expect(screeningRules("tende_da_sole", "Tenda in PVC con motore", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.awning,
      gTot: 0.06,
      calculation: "Dichiarato dal fornitore",
      material: ENEA_SCREENING_MATERIAL.pvc,
      regulation: ENEA_SCREENING_REGULATION.automatic,
    });
  });

  it("usa altra schermatura, misto, manuale e gTot 0,33 per la zanzariera", () => {
    expect(screeningRules("altro", "Zanzariera", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.otherSolarScreening,
      gTot: 0.33,
      calculation: "Dichiarato dal fornitore",
      material: ENEA_SCREENING_MATERIAL.mixed,
      regulation: ENEA_SCREENING_REGULATION.manual,
    });
  });

  it("non perde una motorizzazione esplicita sulla zanzariera", () => {
    expect(screeningRules("altro", "Zanzariera motorizzata", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.otherSolarScreening,
      material: ENEA_SCREENING_MATERIAL.mixed,
      regulation: ENEA_SCREENING_REGULATION.automatic,
    });
  });

  it("usa altra schermatura e metallo automatico per la pergola bioclimatica", () => {
    expect(screeningRules("pergola", "Pergola bioclimatica", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.otherSolarScreening,
      gTot: 0.06,
      material: ENEA_SCREENING_MATERIAL.metal,
      regulation: ENEA_SCREENING_REGULATION.automatic,
    });
  });

  it("usa altra schermatura e PVC automatico per la pergotenda", () => {
    expect(screeningRules("pergotenda", "Pergotenda", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.otherSolarScreening,
      material: ENEA_SCREENING_MATERIAL.pvc,
      regulation: ENEA_SCREENING_REGULATION.automatic,
    });
  });

  it("dà priorità all'alluminio esplicito sulla pergotenda", () => {
    expect(screeningRules("pergotenda", "Pergotenda in alluminio", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.otherSolarScreening,
      material: ENEA_SCREENING_MATERIAL.metal,
      regulation: ENEA_SCREENING_REGULATION.automatic,
    });
  });

  it("dà priorità al PVC esplicito sulla pergola", () => {
    expect(screeningRules("pergola", "Pergola con telo PVC", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.otherSolarScreening,
      material: ENEA_SCREENING_MATERIAL.pvc,
      regulation: ENEA_SCREENING_REGULATION.automatic,
    });
  });

  it("non inventa il materiale della tapparella se manca in fattura", () => {
    expect(screeningRules("altro", "Tapparella motorizzata", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.otherSolarScreening,
      gTot: 0.06,
      material: "",
      regulation: ENEA_SCREENING_REGULATION.automatic,
    });
  });
});
