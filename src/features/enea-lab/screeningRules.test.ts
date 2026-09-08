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
      gTot: 0.13,
      gTotResolutionStatus: "resolved",
      calculation: "Dichiarato dal fornitore",
      material: ENEA_SCREENING_MATERIAL.pvc,
      regulation: ENEA_SCREENING_REGULATION.automatic,
    });
  });

  it("mantiene fail-closed una riga Cristal senza gTot esplicito", () => {
    expect(screeningRules("altro", "Cristal trasparente", null)).toMatchObject({
      gTot: null,
      gTotResolutionStatus: "operator_required",
    });
  });

  it("interpreta arganello o molla come movimentazione manuale", () => {
    expect(screeningRules("tende_da_sole", "Tenda motorizzata con arganello", null).regulation).toBe(ENEA_SCREENING_REGULATION.manual);
    expect(screeningRules("tende_da_sole", "Comando a molla", null).regulation).toBe(ENEA_SCREENING_REGULATION.manual);
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

  it("per la zanzariera fa prevalere il gTot originario esplicito sul fallback 0,33", () => {
    expect(screeningRules("altro", "Zanzariera", 0.21)).toMatchObject({
      type: ENEA_SCREENING_TYPE.otherSolarScreening,
      gTot: 0.21,
      gTotFromDocument: true,
      material: ENEA_SCREENING_MATERIAL.mixed,
      regulation: ENEA_SCREENING_REGULATION.manual,
    });
  });

  it("per la zanzariera fa prevalere anche il motore originario sul fallback manuale", () => {
    expect(screeningRules("altro", "Zanzariera con motore", 0.35)).toMatchObject({
      type: ENEA_SCREENING_TYPE.otherSolarScreening,
      gTot: 0.35,
      gTotFromDocument: true,
      material: ENEA_SCREENING_MATERIAL.mixed,
      regulation: ENEA_SCREENING_REGULATION.automatic,
    });
  });

  it("usa altra schermatura e metallo manuale per la pergola bioclimatica senza movimentazione specificata", () => {
    expect(screeningRules("pergola", "Pergola bioclimatica", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.otherSolarScreening,
      gTot: 0.06,
      material: ENEA_SCREENING_MATERIAL.metal,
      regulation: ENEA_SCREENING_REGULATION.manual,
    });
  });

  it("usa altra schermatura e PVC manuale per la pergotenda senza movimentazione specificata", () => {
    expect(screeningRules("pergotenda", "Pergotenda", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.otherSolarScreening,
      material: ENEA_SCREENING_MATERIAL.pvc,
      regulation: ENEA_SCREENING_REGULATION.manual,
    });
  });

  it("applica alla tapparella tutte le regole persiana salvo la tipologia ENEA", () => {
    expect(screeningRules("altro", "Tapparella motorizzata", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.rollerShutter,
      gTot: 0.06,
      gTotFromDocument: false,
      supplementaryThermalResistance: 0.17,
      material: ENEA_SCREENING_MATERIAL.metal,
      regulation: ENEA_SCREENING_REGULATION.automatic,
    });
  });

  it("fa prevalere il gTot documentato e usa Manuale come fallback avvolgibile", () => {
    expect(screeningRules("altro", "Avvolgibile in alluminio", 0.12)).toMatchObject({
      type: "Persiane avvolgibili",
      gTot: 0.12,
      gTotFromDocument: true,
      supplementaryThermalResistance: 0.17,
      material: "Metallo",
      regulation: "Manuale",
    });
  });

  it("mappa la persiana nella tipologia dedicata con i fallback autorizzati", () => {
    expect(screeningRules("altro", "Persiana in alluminio", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.persiana,
      installation: "Esterna",
      calculation: "Dichiarato dal fornitore",
      gTot: 0.06,
      gTotFromDocument: false,
      supplementaryThermalResistance: 0.17,
      material: ENEA_SCREENING_MATERIAL.metal,
      regulation: ENEA_SCREENING_REGULATION.manual,
    });
  });

  it("fa prevalere gTot e motore espliciti nella persiana", () => {
    expect(screeningRules("altro", "Persiana in alluminio motorizzata", 0.11)).toMatchObject({
      type: ENEA_SCREENING_TYPE.persiana,
      gTot: 0.11,
      gTotFromDocument: true,
      supplementaryThermalResistance: 0.17,
      material: ENEA_SCREENING_MATERIAL.metal,
      regulation: ENEA_SCREENING_REGULATION.automatic,
    });
  });
});
