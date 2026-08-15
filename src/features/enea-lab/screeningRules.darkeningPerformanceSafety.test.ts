import { describe, expect, it } from "vitest";
import {
  ENEA_SCREENING_TYPE,
  screeningRules,
} from "./screeningRules";

describe("prestazioni chiusure oscuranti", () => {
  it("non inventa gTot o modalità da schermatura solare per una tapparella", () => {
    expect(screeningRules("altro", "Tapparella motorizzata", null)).toMatchObject({
      type: ENEA_SCREENING_TYPE.rollerShutter,
      gTot: 0,
      gTotFromDocument: false,
      calculation: "",
    });
  });
});
