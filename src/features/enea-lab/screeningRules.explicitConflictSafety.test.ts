import { describe, expect, it } from "vitest";
import { screeningRules } from "./screeningRules";

describe("fail-closed sui segnali documentali contraddittori delle schermature", () => {
  it("non sceglie interna o esterna quando il documento le dichiara entrambe", () => {
    expect(screeningRules("altro", "Veneziana interna esterna in alluminio manuale", null).installation).toBe("");
  });

  it("non sceglie manuale o automatico quando il documento dichiara entrambe le regolazioni", () => {
    expect(screeningRules("tende_da_sole", "Tenda da sole manuale motorizzata", null).regulation).toBe("");
  });

  it("non sceglie un materiale quando il documento ne dichiara due incompatibili", () => {
    expect(screeningRules("tende_da_sole", "Tenda da sole in PVC e alluminio manuale", null).material).toBe("");
  });
});
