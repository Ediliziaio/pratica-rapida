import { describe, expect, it } from "vitest";
import { ENEA_SCREENING_PORTAL_FIELDS } from "./portalScreening";
import { ENEA_SCREENING_REGULATION } from "./screeningRules";

describe("contratto osservato meccanismo schermature ENEA 2026", () => {
  it("mappa Manuale, Automatico e Servoassistito sui valori osservati", () => {
    const regulation = ENEA_SCREENING_PORTAL_FIELDS.find(({ portalId }) => portalId === "id-mec");

    expect(regulation?.selectValues).toMatchObject({
      [ENEA_SCREENING_REGULATION.manual]: "143",
      [ENEA_SCREENING_REGULATION.automatic]: "144",
      [ENEA_SCREENING_REGULATION.servoAssisted]: "145",
    });
  });
});
