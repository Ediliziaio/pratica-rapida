import { describe, expect, it } from "vitest";
import { settleCaseTruthAfterWorkerQuiescence } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerCaseFinalizer.mjs";

describe("finalizzatore autorevole dopo quiescenza", () => {
  it("non congela il verdetto precoce di stop se il salvataggio vero arriva durante l'arresto", async () => {
    const stoppedTooEarly = { entry: { state: "operator_intervention", draftId: "440001", completedPageIds: [], expectedPageIds: ["Beneficiario"] }, verified: false };
    const savedAfterNineSeconds = { entry: { state: "saved", draftId: "440001", completedPageIds: ["Beneficiario"], expectedPageIds: ["Beneficiario"] }, verified: true };
    const observations = [stoppedTooEarly, savedAfterNineSeconds, savedAfterNineSeconds];
    let active = true;
    const result = await settleCaseTruthAfterWorkerQuiescence({ stopWorkerServices: async () => { active = false; }, workerServicesActive: () => active, readObservation: () => observations.shift() ?? savedAfterNineSeconds, wait: async () => {}, stabilityIntervalMs: 0 });
    expect(result).toMatchObject({ kind: "saved", entry: { draftId: "440001", state: "saved" } });
  });

  it("rifiuta un verdetto se il worker non e' realmente quiescente", async () => {
    await expect(settleCaseTruthAfterWorkerQuiescence({ stopWorkerServices: async () => {}, workerServicesActive: () => true, readObservation: () => ({ entry: null, verified: false }), wait: async () => {}, quiescenceTimeoutMs: -1 })).rejects.toThrow("apr_case_finalizer_worker_not_quiescent");
  });
});
