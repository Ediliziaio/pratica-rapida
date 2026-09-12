import { describe, expect, it } from "vitest";
import type { AprCrmLocalPreflightState } from "./crmLocalPreflight";
import type { AprInfissiBatchPreflightState } from "./infissiBatchPreflight";
import type { AprInfissiLocalMappingState } from "./infissiLocalMappingPreflight";
import type { AprEneaDraftExecutionState } from "./eneaDraftExecution";
import type { DeepReviewState } from "./deepCaseReview";
import type { AprOuterWatchdogStallState } from "./outerWatchdogStall";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { computeAprInputCorpusFingerprint } from "./aprCorpusFingerprint";
import { collectAprCaseObservations, type AprCaseObservationCheckpointBundle, type AprReplayRunManifest } from "./aprCaseObservationCollector";
import { resolveAprCaseStatusTruth } from "./aprCaseStatusResolver";

const sha = (character: string) => character.repeat(64);
const inputCorpusFingerprint = computeAprInputCorpusFingerprint({ corpusVersion: "fixed-v1", cases: Array.from({ length: 40 }, (_, index) => ({ customerKey: `fixture-${index + 1}`, dossierSha256: sha("a"), originalDocumentSetSha256: sha("b") })) });
const manifest: AprReplayRunManifest = { version: "apr-replay-run-manifest-v1", runId: "run-v1", createdAt: "2026-08-23T20:00:00.000Z", inputCorpusFingerprint, sourceFingerprints: { common: sha("c"), infissiBatch: sha("d"), execution: sha("e") } };
const corpus = canonicalSha256(inputCorpusFingerprint);
const common = (state: "ready_local_plan" | "blocked_case" = "ready_local_plan") => ({ runId: manifest.runId, corpusFingerprint: corpus, state: { sourceFingerprint: sha("c"), items: [{ customerKey: "fixture-1", state, report: { outcome: state, blockers: state === "blocked_case" ? [{ code: "blocked", reason: "blocked" }] : [] } }] } as unknown as AprCrmLocalPreflightState });
const batch = () => ({ runId: manifest.runId, corpusFingerprint: corpus, state: { sourceFingerprint: sha("d"), items: [{ customerKey: "fixture-1", state: "ready_local_plan", report: { outcome: "ready_local_plan", blockers: [] } }] } as unknown as AprInfissiBatchPreflightState });
const execution = () => ({ runId: manifest.runId, corpusFingerprint: corpus, state: { sourceFingerprint: sha("e"), items: [{ customerKey: "fixture-1", state: "saved", operatorGateBlockers: [], uncertainPageSave: null, reason: "saved" }] } as unknown as AprEneaDraftExecutionState });
const bundle = (overrides: Partial<AprCaseObservationCheckpointBundle> = {}): AprCaseObservationCheckpointBundle => ({ manifest, common: common(), infissiBatch: batch(), ...overrides });
const screeningCommon = (withPortalGate = true) => ({ runId: manifest.runId, corpusFingerprint: corpus, state: { sourceFingerprint: sha("c"), items: [{
  customerKey: "fixture-1", state: "ready_local_plan", report: {
    outcome: "ready_local_plan", blockers: [], products: [{ rowId: "screening-1" }],
    ...(withPortalGate ? { eneaPayloadAudit: { draftReady: true, blockers: [], portalGate: { status: "ready", screeningItemCount: 1, supportedPages: ["Schermature solari"] } } } : {}),
  },
}] } as unknown as AprCrmLocalPreflightState });

const stallTrace = (customerKey = "fixture-1"): AprOuterWatchdogStallState => ({
  version: "apr-outer-watchdog-stall-state-v1", customerKey, cohort: 4242, batchRunId: "apr-batch-fixture",
  detectedAt: "2026-09-12T10:07:00.000Z", reason: "no_material_progress_for_7_minutes",
  startedAt: "2026-09-12T10:00:00.000Z", lastProgressAt: "2026-09-12T10:00:00.000Z", lastObservedFingerprint: "fixture-fingerprint",
});

describe("APR local case observation collector", () => {
  it("raccoglie un caso READY e genera le fonti non applicabili", () => {
    const result = collectAprCaseObservations(bundle(), "fixture-1");
    expect(result.status).toBe("COLLECTED");
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "preflight_common", status: "PASS" }),
      expect.objectContaining({ source: "product_gate", status: "PASS" }),
      expect.objectContaining({ source: "deep_review", status: "NOT_APPLICABLE" }),
      expect.objectContaining({ source: "execution", status: "NOT_APPLICABLE" }),
      expect.objectContaining({ source: "checkpoint", status: "NOT_APPLICABLE" }),
    ]));
  });

  it("raccoglie un caso COMPLETED", () => {
    const result = collectAprCaseObservations(bundle({ execution: execution() }), "fixture-1");
    expect(result.observations).toEqual(expect.arrayContaining([expect.objectContaining({ source: "execution", status: "COMPLETED" })]));
  });

  it("raccoglie il gate Schermature dal preflight comune e risolve READY", () => {
    const result = collectAprCaseObservations(bundle({ common: screeningCommon(), infissiBatch: undefined }), "fixture-1");
    expect(result.observations).toEqual(expect.arrayContaining([expect.objectContaining({ source: "product_gate", status: "PASS" })]));
    expect(resolveAprCaseStatusTruth(result.observations)).toMatchObject({ status: "READY", matchedTransitionId: "ready_before_execution" });
  });

  it("mantiene MISSING_SOURCE quando il gate Schermature non è stato realmente raggiunto", () => {
    const result = collectAprCaseObservations(bundle({ common: screeningCommon(false), infissiBatch: undefined }), "fixture-1");
    expect(result.observations.some((item) => item.source === "product_gate")).toBe(false);
    expect(resolveAprCaseStatusTruth(result.observations)).toMatchObject({ status: "INCONSISTENT", reason: expect.stringContaining("product_gate") });
  });

  it("conserva entrambi i gate prodotto duplicati senza scegliere per priorità", () => {
    const mappingState = { status: "ready_for_portal_mapping", sourceSignature: sha("f"), item: { customerKey: "fixture-1", caseTruth: "READY", report: { outcome: "ready_local_plan", blockers: [] } } } as unknown as AprInfissiLocalMappingState;
    const duplicated = bundle({ infissiMapping: { runId: manifest.runId, corpusFingerprint: corpus, state: mappingState }, manifest: { ...manifest, sourceFingerprints: { ...manifest.sourceFingerprints, infissiMapping: sha("f") } } });
    expect(collectAprCaseObservations(duplicated, "fixture-1").observations.filter((item) => item.source === "product_gate")).toHaveLength(2);
  });

  it("pubblica un solo gate autorevole per Armando quando le fonti instradano un prodotto misto", () => {
    const commonState = screeningCommon();
    commonState.state.items[0].customerKey = "fixture-1";
    const mixedBatch = batch();
    mixedBatch.state.items[0].productModule = "mixed";
    const result = collectAprCaseObservations(bundle({ common: commonState, infissiBatch: mixedBatch }), "fixture-1");
    expect(result.observations.filter((item) => item.source === "product_gate")).toEqual([
      expect.objectContaining({ productModule: "mixed", status: "PASS", blockerCodes: [] }),
    ]);
  });

  it("non usa il solo gate Infissi quando il routing misto non ha raggiunto Schermature", () => {
    const mixedBatch = batch();
    mixedBatch.state.items[0].productModule = "mixed";
    const result = collectAprCaseObservations(bundle({ common: screeningCommon(false), infissiBatch: mixedBatch }), "fixture-1");
    expect(result.observations.filter((item) => item.source === "product_gate")).toEqual([
      expect.objectContaining({ productModule: "mixed", status: "MISSING" }),
    ]);
    expect(resolveAprCaseStatusTruth(result.observations)).toMatchObject({ status: "INCONSISTENT" });
  });

  it("rifiuta checkpoint con runId diverso", () => {
    const result = collectAprCaseObservations(bundle({ common: { ...common(), runId: "other" } }), "fixture-1");
    expect(result).toMatchObject({ status: "REJECTED", observations: [], errors: ["checkpoint_run_id_mismatch:common"] });
  });

  it("rifiuta checkpoint con fingerprint corpus diverso", () => {
    const result = collectAprCaseObservations(bundle({ common: { ...common(), corpusFingerprint: sha("0") } }), "fixture-1");
    expect(result).toMatchObject({ status: "REJECTED", observations: [], errors: ["checkpoint_corpus_fingerprint_mismatch:common"] });
  });

  it("genera blocker strutturati coerenti", () => {
    const result = collectAprCaseObservations(bundle({ common: common("blocked_case"), infissiBatch: undefined }), "fixture-1");
    expect(result.observations).toEqual(expect.arrayContaining([expect.objectContaining({ source: "report_blockers", blockerCodes: ["blocked"] })]));
  });

  it("classifica come blocco tecnico una pratica stallata e uccisa dal watchdog esterno, senza richiedere il preflight comune", () => {
    const neverReachedCommon = common();
    neverReachedCommon.state.items = [];
    const result = collectAprCaseObservations(bundle({ common: neverReachedCommon, infissiBatch: undefined, outerWatchdogStall: stallTrace() }), "fixture-1");
    expect(result).toMatchObject({ status: "COLLECTED", errors: [] });
    expect(resolveAprCaseStatusTruth(result.observations)).toMatchObject({ status: "TECHNICAL_BLOCK", matchedTransitionId: "common_block_technical" });
  });

  it("una pratica gia' bloccata e poi uccisa dal watchdog diventa intervento operatore, non disaccordo fra fonti", () => {
    const result = collectAprCaseObservations(bundle({ common: common("blocked_case"), infissiBatch: undefined, outerWatchdogStall: stallTrace() }), "fixture-1");
    expect(result).toMatchObject({ status: "COLLECTED", errors: [] });
    expect(result.observations.some((item) => item.blockerCodes.includes("outer_watchdog_stall_detected"))).toBe(false);
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "preflight_common", status: "BLOCKED", blockerCodes: ["blocked"] }),
      expect.objectContaining({ source: "deep_review", status: "BLOCKED", classification: "OPERATOR", blockerCodes: ["blocked"] }),
      expect.objectContaining({ source: "execution", status: "NOT_APPLICABLE" }),
    ]));
    expect(resolveAprCaseStatusTruth(result.observations)).toMatchObject({ status: "OPERATOR_REQUIRED", matchedTransitionId: "common_block_operator" });
  });

  it("non sostituisce la deep review quando ha gia' classificato il blocco, anche se esiste una traccia di stallo", () => {
    const deepReview = { runId: manifest.runId, corpusFingerprint: corpus, state: { sourceFingerprint: sha("g"), items: [
      { customerKey: "fixture-1", state: "technical_repair", blockerCodes: ["blocked"], productModule: "infissi" },
    ] } as unknown as DeepReviewState };
    const result = collectAprCaseObservations(bundle({
      common: common("blocked_case"), infissiBatch: undefined, deepReview, outerWatchdogStall: stallTrace(),
      manifest: { ...manifest, sourceFingerprints: { ...manifest.sourceFingerprints, deepReview: sha("g") } },
    }), "fixture-1");
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "deep_review", status: "BLOCKED", classification: "TECHNICAL" }),
    ]));
  });

  it("non usa la traccia di stallo se l'esecuzione ha comunque raggiunto un esito terminale", () => {
    const saved = { runId: manifest.runId, corpusFingerprint: corpus, state: { sourceFingerprint: sha("e"), items: [
      { customerKey: "fixture-1", state: "saved", operatorGateBlockers: [], uncertainPageSave: null, reason: "saved" },
    ] } as unknown as AprEneaDraftExecutionState };
    const result = collectAprCaseObservations(bundle({ common: common("blocked_case"), infissiBatch: undefined, execution: saved, outerWatchdogStall: stallTrace() }), "fixture-1");
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "execution", status: "COMPLETED" }),
    ]));
  });

  it("ignora una traccia di stallo che appartiene a un altro cliente", () => {
    const neverReachedCommon = common();
    neverReachedCommon.state.items = [];
    const result = collectAprCaseObservations(bundle({ common: neverReachedCommon, infissiBatch: undefined, outerWatchdogStall: stallTrace("altro-cliente") }), "fixture-1");
    expect(result).toMatchObject({ status: "REJECTED", errors: ["case_missing_from_common_preflight"] });
  });

  it("produce soltanto una osservazione MISSING per un caso bloccato privo dei blocker strutturati", () => {
    const malformed = common("blocked_case");
    malformed.state.items[0].report!.blockers = [];
    const result = collectAprCaseObservations(bundle({ common: malformed, infissiBatch: undefined }), "fixture-1");
    expect(result).toMatchObject({ status: "COLLECTED", errors: [] });
    expect(result.observations).toEqual(expect.arrayContaining([expect.objectContaining({ source: "report_blockers", status: "MISSING" })]));
  });
});
