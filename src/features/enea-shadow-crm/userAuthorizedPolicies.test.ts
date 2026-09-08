import { describe, expect, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import { resolveUserAuthorizedScreeningRow } from "./userAuthorizedPolicies";

describe("policy utente schermature", () => {
  it("blocca Cristal senza gTot documentato", () => {
    expect(resolveUserAuthorizedScreeningRow("Tenda cristal guidata con motore")).toBeNull();
  });

  it("classifica pergola con gTot 0,06 e le assegna precedenza nella riga mista", () => {
    expect(resolveUserAuthorizedScreeningRow("Pergola completa di tende Cristal")).toMatchObject({
      product: "pergola", gTot: 0.06, gTotSource: "fallback", ruleId: USER_AUTHORIZED_RULE_IDS.pergolaScreening, priority: 300,
    });
  });

  it("usa il gTot esplicito della fonte originaria prima del fallback pergola", () => {
    expect(resolveUserAuthorizedScreeningRow("PERGOLA ROOM", 0.02)).toMatchObject({
      product: "pergola", gTot: 0.02, gTotSource: "original_practice_source",
      provenance: "original_practice_source", ruleId: USER_AUTHORIZED_RULE_IDS.pergolaScreening,
    });
  });

  it("usa il gTot esplicito della fonte originaria prima del fallback Cristal", () => {
    expect(resolveUserAuthorizedScreeningRow("Tenda Cristal", 0.19)).toMatchObject({
      product: "cristal", gTot: 0.19, gTotSource: "original_practice_source", provenance: "original_practice_source",
    });
  });

  it("non inventa una classificazione per diciture diverse", () => {
    expect(resolveUserAuthorizedScreeningRow("Luci LED tre linee")).toBeNull();
  });
});
