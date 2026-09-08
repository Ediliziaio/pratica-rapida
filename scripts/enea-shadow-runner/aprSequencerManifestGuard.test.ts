import { describe, expect, it } from "vitest";
import { validateSequencerManifest } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerManifestGuard.mjs";

const armando = { customerKey: "armando-ranzoni", stage: "archiviate" };
const valid = {
  selection: { total: 1, allowedStages: ["archiviate"], excludedCustomerKeys: ["beatrice-ciotta"] },
  cases: [armando],
};

describe("contratto manifest del sequencer APR", () => {
  it("accetta il test mirato autorizzato quando stage e identita sono dichiarati", () => {
    expect(validateSequencerManifest(valid, valid.cases)).toMatchObject({ expectedCount: 1, allowedStages: ["archiviate"] });
  });

  it("fallisce chiuso con un errore tipizzato se allowedStages manca", () => {
    expect(() => validateSequencerManifest({ ...valid, selection: { total: 1, excludedCustomerKeys: ["beatrice-ciotta"] } }, valid.cases))
      .toThrow("manifest_allowed_stages_required");
  });

  it("rifiuta identita escluse e stage non autorizzati senza avviare una coorte", () => {
    expect(() => validateSequencerManifest({ ...valid, selection: { ...valid.selection, excludedCustomerKeys: ["armando-ranzoni"] } }, valid.cases))
      .toThrow("manifest_contains_excluded_identity");
    expect(() => validateSequencerManifest(valid, [{ ...armando, stage: "non-autorizzato" }]))
      .toThrow("manifest_contains_disallowed_pipeline_stage");
  });
});
