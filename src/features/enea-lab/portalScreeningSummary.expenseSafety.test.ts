import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaScreeningSummaryPortalScript } from "./portalScreeningSummary";

describe("builder riepilogo schermature: spesa ufficiale verificata", () => {
  it("non compila la spesa automatica o nulla e accetta solo una spesa positiva verificata dall'operatore", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const expense = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "schermature.spesa")!;

    expect(expense.source).toBe("Calcolo ENEA");
    expect(expense.status).toBe("ready");

    const automatic = buildEneaScreeningSummaryPortalScript(mapped);
    expect(automatic.readyFieldIds).toEqual([]);
    expect(automatic.skippedFieldIds).toEqual(["schermature.spesa"]);

    expense.source = "Inserimento operatore";
    expense.value = "0 €";
    expense.status = "ready";
    const zero = buildEneaScreeningSummaryPortalScript(mapped);
    expect(zero.readyFieldIds).toEqual([]);

    expense.value = "1000 €";
    const verified = buildEneaScreeningSummaryPortalScript(mapped);
    expect(verified.readyFieldIds).toEqual(["schermature.spesa"]);
    expect(verified.runtime.fields).toEqual([
      { portalId: "id-costo", control: "input", value: "1000" },
    ]);
  });

  it.each([
    ["1.000 EUR", "1000"],
    ["1.000 euro", "1000"],
  ])("normalizza l'unità monetaria verificata %s prima del runtime", (value, expected) => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const expense = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "schermature.spesa")!;

    expense.source = "Inserimento operatore";
    expense.value = value;
    expense.status = "ready";

    const verified = buildEneaScreeningSummaryPortalScript(mapped);
    expect(verified.readyFieldIds).toEqual(["schermature.spesa"]);
    expect(verified.runtime.fields).toEqual([
      { portalId: "id-costo", control: "input", value: expected },
    ]);
  });
});
