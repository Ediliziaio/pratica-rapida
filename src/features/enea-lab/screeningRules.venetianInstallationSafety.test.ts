import { describe, expect, it } from "vitest";
import {
  ENEA_SCREENING_TYPE,
  screeningRules,
} from "./screeningRules";

describe("sicurezza installazione veneziana", () => {
  it("non inventa Esterna quando il documento non specifica Interna o Esterna", () => {
    expect(screeningRules("altro", "Veneziana in alluminio manuale", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.awning,
      installation: "",
    });
  });
});
