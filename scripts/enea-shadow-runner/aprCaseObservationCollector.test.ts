import { describe, expect, it } from "vitest";
import type { AprCrmLocalPreflightState } from "./crmLocalPreflight";
import type { AprInfissiBatchPreflightState } from "./infissiBatchPreflight";
import type { AprInfissiLocalMappingState } from "./infissiLocalMappingPreflight";
import type { AprEneaDraftExecutionState } from "./eneaDraftExecution";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { computeAprInputCorpusFingerprint } from "./aprCorpusFingerprint";
import { collectAprCaseObservations, type AprCaseObservationCheckpointBundle, type AprReplayRunManifest } from "./aprCaseObservationCollector";

const sha = (character: string) => character.repeat(64);
const inputCorpusFingerprint = computeAprInputCorpusFingerprint({ corpusVersion: "fixed-v1", cases: Array.from({ length: 40 }, (_, index) => ({ customerKey: `fixture-${index + 1}`, dossierSha256: sha("a"), originalDocumentSetSha256: sha("b") })) });
const manifest: AprReplayRunManifest = { version: "apr-replay-run-manifest-v1", runId: "run-v1", createdAt: "2026-08-23T20:00:00.000Z", inputCorpusFingerprint, sourceFingerprints: { common: sha("c"), infissiBatch: sha("d"), execution: sha("e") } };
const corpus = canonicalSha256(inputCorpusFingerprint);
const common = (state: "ready_local_plan" | "blocked_case" = "ready_local_plan") => ({ runId: manifest.runId, corpusFingerprint: corpus, state: { sourceFingerprint: sha("c"), items: [{ customerKey: "fixture-1", state, report: { outcome: state, blockers: state === "blocked_case" ? [{ code: "blocked", reason: "blocked" }] : [] } }] } as unknown as AprCrmLocalPreflightState });
const batch = () => ({ runId: manifest.runId, corpusFingerprint: corpus, state: { sourceFingerprint: sha("d"), items: [{ customerKey: "fixture-1", state: "ready_local_plan", report: { outcome: "ready_local_plan", blockers: [] } }] } as unknown as AprInfissiBatchPreflightState });
const execution = () => ({ runId: manifest.runId, corpusFingerprint: corpus, state: { sourceFingerprint: sha("e"), items: [{ customerKey: "fixture-1", state: "saved", operatorGateBlockers: [], uncertainPageSave: null, reason: "saved" }] } as unknown as AprEneaDraftExecutionState });
const bundle = (overrides: Partial<AprCaseObservationCheckpointBundle> = {}): AprCaseObservationCheckpointBundle => ({ manifest, common: common(), infissiBatch: batch(), ...overrides });

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

  it("conserva entrambi i gate prodotto duplicati senza scegliere per priorità", () => {
    const mappingState = { status: "ready_for_portal_mapping", sourceSignature: sha("f"), item: { customerKey: "fixture-1", caseTruth: "READY", report: { outcome: "ready_local_plan", blockers: [] } } } as unknown as AprInfissiLocalMappingState;
    const duplicated = bundle({ infissiMapping: { runId: manifest.runId, corpusFingerprint: corpus, state: mappingState }, manifest: { ...manifest, sourceFingerprints: { ...manifest.sourceFingerprints, infissiMapping: sha("f") } } });
    expect(collectAprCaseObservations(duplicated, "fixture-1").observations.filter((item) => item.source === "product_gate")).toHaveLength(2);
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

  it("rifiuta un caso bloccato privo dei blocker strutturati", () => {
    const malformed = common("blocked_case");
    malformed.state.items[0].report!.blockers = [];
    const result = collectAprCaseObservations(bundle({ common: malformed, infissiBatch: undefined }), "fixture-1");
    expect(result).toMatchObject({ status: "REJECTED", errors: ["structured_blockers_missing_for_blocked_observation"] });
    expect(result.observations).toEqual(expect.arrayContaining([expect.objectContaining({ source: "report_blockers", status: "MISSING" })]));
  });
});
