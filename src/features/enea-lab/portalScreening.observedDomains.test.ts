import { describe, expect, it } from "vitest";
import { ENEA_SCREENING_PORTAL_FIELDS } from "./portalScreening";
import { ENEA_SCREENING_CALCULATION, ENEA_SCREENING_INSTALLATION, ENEA_SCREENING_TYPE } from "./screeningRules";

describe("contratto schermature ENEA 2026", () => {
  it("mantiene i codici osservati per tipo, installazione e calcolo", () => {
    const type = ENEA_SCREENING_PORTAL_FIELDS.find((field) => field.portalId === "id-tipo");
    const installation = ENEA_SCREENING_PORTAL_FIELDS.find((field) => field.portalId === "id-inst");
    const calculation = ENEA_SCREENING_PORTAL_FIELDS.find((field) => field.portalId === "id-calc");
    expect(type?.selectValues?.[ENEA_SCREENING_TYPE.shutter]).toBe("125");
    expect(type?.selectValues?.[ENEA_SCREENING_TYPE.rollerShutter]).toBe("126");
    expect(type?.selectValues?.[ENEA_SCREENING_TYPE.integrated]).toBe("416");
    expect(type?.selectValues?.[ENEA_SCREENING_TYPE.otherDarkeningClosure]).toBe("310");
    expect(installation?.selectValues?.[ENEA_SCREENING_INSTALLATION.internal]).toBe("191");
    expect(calculation?.selectValues?.[ENEA_SCREENING_CALCULATION.closureTable]).toBe("195");
    expect(calculation?.selectValues?.[ENEA_SCREENING_CALCULATION.uniEn13125]).toBe("307");
  });
});
