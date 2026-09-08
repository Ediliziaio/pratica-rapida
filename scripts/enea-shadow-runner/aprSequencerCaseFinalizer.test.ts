import { describe, expect, it } from "vitest";
import { classifyQuiescentCaseTruth, settleCaseTruthAfterWorkerQuiescence, settleCaseTruthWhileWorkerContinues } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerCaseFinalizer.mjs";
import { classifySequencerTerminalTruth } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerTerminalTruth.mjs";
// @ts-expect-error Operational sequencer guards are intentionally native ESM.
import { resolvePreflightTerminalDisposition } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerPreflightGuard.mjs";

describe("finalizzatore autorevole dopo quiescenza", () => {
  it("attende la conclusione reale della deep review prima di finalizzare un preflight bloccato", () => {
    const common = { status: "completed", items: [{ customerKey: "elena-berti", state: "blocked_case", report: { blockers: [{ code: "draft_payload_mapping_incomplete" }] } }] };
    const deep: {
      status: string;
      items: Array<{
        customerKey: string;
        state: string;
        classification: string | null;
        blockerCodes: string[];
        endedAt: string | null;
      }>;
    } = { status: "working", items: [{ customerKey: "elena-berti", state: "reviewing", classification: null, blockerCodes: ["draft_payload_mapping_incomplete"], endedAt: null }] };
    expect(resolvePreflightTerminalDisposition(common, null, deep, "elena-berti", "screening")).toMatchObject({ kind: "wait", ruleId: "system-sequencer-deep-review-terminal-gate-v1" });
    deep.status = "completed";
    deep.items[0] = { ...deep.items[0], state: "technical_repair", classification: "TECHNICAL_REPAIR", endedAt: "2026-09-07T12:00:00.000Z" };
    expect(resolvePreflightTerminalDisposition(common, null, deep, "elena-berti", "screening")).toMatchObject({ kind: "technical_block" });
  });

  it("rifiuta fail-closed un terminale preflight se deep review e blocker non concordano", () => {
    const common = { status: "completed", items: [{ customerKey: "elena-berti", state: "blocked_case", report: { blockers: [{ code: "draft_payload_mapping_incomplete" }] } }] };
    const deep = { status: "completed", items: [{ customerKey: "elena-berti", state: "operator_required", classification: "OPERATOR_REQUIRED", blockerCodes: ["customer_form_missing"], endedAt: "2026-09-07T12:00:00.000Z" }] };
    expect(resolvePreflightTerminalDisposition(common, null, deep, "elena-berti", "screening")).toMatchObject({ kind: "inconsistent", reason: expect.stringContaining("preflight_deep_review_blocker_mismatch") });
  });
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

  it("pubblica atomicamente la verita stabile prima di restituire il verdetto", async () => {
    const observation = { entry: { state: "saved", draftId: "440002", completedPageIds: ["Beneficiario"], expectedPageIds: ["Beneficiario"] }, verified: true };
    const published: unknown[] = [];
    await expect(settleCaseTruthAfterWorkerQuiescence({ stopWorkerServices: async () => {}, workerServicesActive: () => false, readObservation: () => observation, publishTerminalTruth: async (truth: unknown) => { published.push(truth); }, wait: async () => {}, stabilityIntervalMs: 0 })).resolves.toMatchObject({ kind: "saved" });
    expect(published).toEqual([{ kind: "saved", entry: observation.entry, verified: true }]);
  });

  it("pubblica una verita terminale stabile senza arrestare il worker persistente", async () => {
    const observation = { entry: { state: "saved", draftId: "440003", completedPageIds: ["Beneficiario"], expectedPageIds: ["Beneficiario"] }, verified: true };
    const published: unknown[] = [];
    await expect(settleCaseTruthWhileWorkerContinues({
      readObservation: () => observation,
      publishTerminalTruth: async (truth: unknown) => { published.push(truth); },
      wait: async () => {},
      stabilityIntervalMs: 0,
    })).resolves.toMatchObject({ kind: "saved", entry: { draftId: "440003" } });
    expect(published).toHaveLength(1);
  });

  it("resta fail-closed e continua ad attendere il worker finche la verita diventa terminale", async () => {
    const filling = { entry: { state: "filling", draftId: "440004", completedPageIds: [], expectedPageIds: ["Beneficiario"] }, verified: false };
    const saved = { entry: { state: "saved", draftId: "440004", completedPageIds: ["Beneficiario"], expectedPageIds: ["Beneficiario"] }, verified: true };
    const observations = [filling, filling, saved, saved];
    let unresolved = 0;
    await expect(settleCaseTruthWhileWorkerContinues({
      readObservation: () => observations.shift() ?? saved,
      wait: async () => {},
      stabilityIntervalMs: 0,
      onUnresolved: async () => { unresolved += 1; },
    })).resolves.toMatchObject({ kind: "saved", entry: { draftId: "440004" } });
    expect(unresolved).toBe(1);
  });

  it("non trasforma un generico operator_intervention privo di blocker in verdetto coerente", () => {
    expect(classifySequencerTerminalTruth({ kind: "case_block", entry: { state: "operator_intervention", operatorGateBlockers: [] }, verified: false, reason: "nessuna prova" })).toMatchObject({ publicStatus: "INCONSISTENT", consistency: "INCONSISTENT" });
    expect(classifySequencerTerminalTruth({ kind: "common_technical", reason: "sessione ENEA non disponibile" })).toMatchObject({ lifecycleState: "technical_stop", publicStatus: "TECHNICAL_BLOCK", consistency: "CONSISTENT" });
  });

  it("non finalizza probing o recovery_queued come blocchi pratica", () => {
    expect(classifyQuiescentCaseTruth({ entry: { state: "operator_intervention", uncertainPageSave: { status: "probing" } }, verified: false })).toMatchObject({ kind: "unresolved" });
    expect(classifyQuiescentCaseTruth({ entry: { state: "recovery_queued", uncertainPageSave: { status: "recovery_authorized" } }, verified: false })).toMatchObject({ kind: "unresolved" });
    expect(classifyQuiescentCaseTruth({ entry: { state: "operator_intervention", uncertainPageSave: { status: "operator_required", probes: [{ method: "persisted_fields_get" }] } }, verified: false })).toMatchObject({ kind: "case_block" });
  });

  it("rende coerente un errore tecnico circoscritto solo con evidenza driver persistita e tipizzata", () => {
    expect(classifySequencerTerminalTruth({
      kind: "case_block",
      entry: {
        state: "operator_intervention",
        operatorGateBlockers: [],
        serverEvidenceIds: ["driver-error-13d178b865222bc9"],
        reason: "Errore circoscritto alla pratica: apr_cdp_command_timeout:Runtime.evaluate",
      },
      verified: false,
    })).toMatchObject({ lifecycleState: "technical_stop", publicStatus: "TECHNICAL_BLOCK", consistency: "CONSISTENT" });
    expect(classifySequencerTerminalTruth({
      kind: "case_block",
      entry: { state: "operator_intervention", operatorGateBlockers: [], serverEvidenceIds: ["driver-error-non-tipizzato"], reason: "Errore circoscritto alla pratica: apr_cdp_command_timeout:Runtime.evaluate" },
      verified: false,
    })).toMatchObject({ publicStatus: "INCONSISTENT", consistency: "INCONSISTENT" });
  });
});
