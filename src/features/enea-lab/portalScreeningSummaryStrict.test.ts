import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import {
  ENEA_LAB_MOCK_ANALYSIS,
  ENEA_LAB_MOCK_PRACTICES,
} from "./mockPractices";
import { buildEneaScreeningSummaryPortalScript } from "./portalScreeningSummary";

describe("riepilogo schermature ENEA fail-closed", () => {
  it("non interpreta sintassi numeriche JavaScript come spesa ENEA verificata", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const expense = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "schermature.spesa")!;

    expense.status = "ready";
    expense.source = "Inserimento operatore";
    expense.testOnly = false;

    for (const invalidValue of ["1e3 €", "0x10 €"]) {
      expense.value = invalidValue;
      const preparation = buildEneaScreeningSummaryPortalScript(mapped);
      expect(preparation.readyFieldIds).toEqual([]);
      expect(preparation.skippedFieldIds).toEqual(["schermature.spesa"]);
      expect(preparation.runtime.fields).toEqual([]);
    }
  });

  it("non trasforma una frazione con zero iniziale in un importo mille volte maggiore", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const expense = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "schermature.spesa")!;

    expense.status = "ready";
    expense.source = "Inserimento operatore";
    expense.testOnly = false;
    expense.value = "0.080 €";

    const preparation = buildEneaScreeningSummaryPortalScript(mapped);
    expect(preparation.readyFieldIds).toEqual(["schermature.spesa"]);
    expect(preparation.runtime.fields).toEqual([
      { portalId: "id-costo", control: "input", value: "0.080" },
    ]);
  });
});
