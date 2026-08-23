import { describe, expect, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import {
  APR_INFISSI_DEFAULT_FRAME_MATERIAL,
  APR_INFISSI_DEFAULT_GLASS_TYPE,
  resolveInfissiProductRules,
} from "./infissiProductRules";

describe("APR Infissi · materiale, vetro e chiusure oscuranti", () => {
  it("applica PVC e vetro basso-emissivo soltanto quando non sono specificati", () => {
    const result = resolveInfissiProductRules({
      practiceId: "infissi-fallback",
      physicalRowId: "infissi-fallback:infisso:1",
      formAlsoInstalledClosures: false,
      formSourceId: "form-cliente",
    });

    expect(result).toMatchObject({
      status: "ready",
      newFrameMaterial: APR_INFISSI_DEFAULT_FRAME_MATERIAL,
      glassType: APR_INFISSI_DEFAULT_GLASS_TYPE,
      eneaShadingClosuresChecked: false,
      oldWindowThermalTransmittanceWm2K: 6,
      audit: {
        newFrameMaterialSource: "authorized_fallback_pvc",
        glassTypeSource: "authorized_fallback_low_emissivity",
        oldWindowThermalTransmittance: {
          source: "authorized_precautionary_fallback",
          fallbackReason: "missing_material",
        },
      },
    });
  });

  it("preserva i valori espliciti delle fonti originarie sopra i fallback", () => {
    const result = resolveInfissiProductRules({
      practiceId: "infissi-esplicito",
      explicitNewFrameMaterial: "Legno",
      explicitGlassType: "Triplo selettivo",
      formOldFrameMaterial: "legno",
      formOldGlazingType: "doppio",
      formAlsoInstalledClosures: true,
    });

    expect(result).toMatchObject({
      status: "ready",
      newFrameMaterial: "Legno",
      glassType: "Triplo selettivo",
      oldWindowThermalTransmittanceWm2K: 3,
      eneaShadingClosuresChecked: true,
      audit: {
        newFrameMaterialSource: "explicit_original_source",
        glassTypeSource: "explicit_original_source",
        oldWindowThermalTransmittance: {
          source: "form_matrix_combination",
          material: "legno",
          glazing: "vetro_doppio",
        },
      },
    });
    expect(result.audit.appliedRuleIds).toEqual(expect.arrayContaining([
      USER_AUTHORIZED_RULE_IDS.infissiMaterialGlassFallbacks,
      USER_AUTHORIZED_RULE_IDS.infissiShadingClosuresFromForm,
      USER_AUTHORIZED_RULE_IDS.infissiOldWindowTransmittanceMatrix,
    ]));
  });

  it("mappa SI su flag selezionato e NO su flag vuoto", () => {
    expect(resolveInfissiProductRules({ practiceId: "si", formAlsoInstalledClosures: true }).eneaShadingClosuresChecked).toBe(true);
    expect(resolveInfissiProductRules({ practiceId: "no", formAlsoInstalledClosures: false }).eneaShadingClosuresChecked).toBe(false);
  });

  it("non inventa la risposta quando il campo del form manca o e ambiguo", () => {
    const result = resolveInfissiProductRules({ practiceId: "senza-risposta" });
    expect(result.status).toBe("operator_required");
    expect(result.eneaShadingClosuresChecked).toBeNull();
    expect(result.blockers).toEqual(["infissi_shading_closures_form_answer_missing_or_ambiguous"]);
  });
});
