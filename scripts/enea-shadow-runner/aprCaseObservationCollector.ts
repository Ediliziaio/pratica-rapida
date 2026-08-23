import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AprInputCorpusFingerprint, AprCaseStatusObservation } from "./aprMonotonicArtifacts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import type { AprCrmLocalPreflightState } from "./crmLocalPreflight";
import type { AprInfissiBatchPreflightState } from "./infissiBatchPreflight";
import type { AprInfissiLocalMappingState } from "./infissiLocalMappingPreflight";
import type { DeepReviewState } from "./deepCaseReview";
import type { AprEneaDraftExecutionState } from "./eneaDraftExecution";
import {
  observeAprCommonPreflight,
  observeAprDeepReview,
  observeAprDraftExecution,
  observeAprInfissiBatchProductGate,
  observeAprInfissiMappingProductGate,
} from "./caseStatusObservationAdapters";
import { createAprNotApplicableObservation, deriveAprCaseSourcePolicy, observeAprStructuredBlockers } from "./aprCaseSourcePolicy";

export const APR_CASE_OBSERVATION_COLLECTOR_VERSION = "apr-case-observation-collector-v1" as const;

type SourceName = "common" | "infissiBatch" | "infissiMapping" | "deepReview" | "execution";

export interface AprReplayRunManifest {
  version: "apr-replay-run-manifest-v1";
  runId: string;
  createdAt: string;
  inputCorpusFingerprint: AprInputCorpusFingerprint;
  sourceFingerprints: Partial<Record<SourceName, string>>;
}

export interface AprBoundCheckpoint<T> {
  runId: string;
  corpusFingerprint: string;
  state: T;
}

export interface AprCaseObservationCheckpointBundle {
  manifest: AprReplayRunManifest;
  common?: AprBoundCheckpoint<AprCrmLocalPreflightState>;
  infissiBatch?: AprBoundCheckpoint<AprInfissiBatchPreflightState>;
  infissiMapping?: AprBoundCheckpoint<AprInfissiLocalMappingState>;
  deepReview?: AprBoundCheckpoint<DeepReviewState>;
  execution?: AprBoundCheckpoint<AprEneaDraftExecutionState>;
}

export interface AprCollectedCaseObservations {
  status: "COLLECTED" | "REJECTED";
  customerKey: string;
  runId: string;
  corpusFingerprint: string;
  sourceAggregateFingerprint: string;
  observations: AprCaseStatusObservation[];
  errors: string[];
}

const readJson = <T>(target: string): T | undefined => existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) as T : undefined;
const corpusFingerprint = (manifest: AprReplayRunManifest) => canonicalSha256(manifest.inputCorpusFingerprint);

export function loadAprCaseObservationCheckpointBundle(rootDirectory: string, manifest: AprReplayRunManifest): AprCaseObservationCheckpointBundle {
  const root = path.resolve(rootDirectory); const corpus = corpusFingerprint(manifest);
  const bind = <T>(relative: string): AprBoundCheckpoint<T> | undefined => {
    const state = readJson<T>(path.join(root, relative));
    return state ? { runId: manifest.runId, corpusFingerprint: corpus, state } : undefined;
  };
  return {
    manifest,
    common: bind<AprCrmLocalPreflightState>("crm-local-preflight/checkpoint.json"),
    infissiBatch: bind<AprInfissiBatchPreflightState>("infissi-batch-preflight/checkpoint.json"),
    infissiMapping: bind<AprInfissiLocalMappingState>("infissi-local-mapping/checkpoint.json"),
    deepReview: bind<DeepReviewState>("deep-case-review/checkpoint.json"),
    execution: bind<AprEneaDraftExecutionState>("enea-draft-execution/checkpoint.json"),
  };
}

function stateFingerprint(source: SourceName, state: unknown): string | null {
  const value = state as unknown as Record<string, unknown>;
  if (source === "infissiMapping") return typeof value.sourceSignature === "string" ? value.sourceSignature : null;
  return typeof value.sourceFingerprint === "string" ? value.sourceFingerprint : null;
}

export function collectAprCaseObservations(
  bundle: AprCaseObservationCheckpointBundle,
  customerKey: string,
): AprCollectedCaseObservations {
  const expectedCorpusFingerprint = corpusFingerprint(bundle.manifest);
  const errors: string[] = [];
  const sources = (["common", "infissiBatch", "infissiMapping", "deepReview", "execution"] as const)
    .flatMap((source) => bundle[source] ? [{ source, checkpoint: bundle[source]! }] : []);
  for (const { source, checkpoint } of sources) {
    if (checkpoint.runId !== bundle.manifest.runId) errors.push(`checkpoint_run_id_mismatch:${source}`);
    if (checkpoint.corpusFingerprint !== expectedCorpusFingerprint) errors.push(`checkpoint_corpus_fingerprint_mismatch:${source}`);
    const expectedSource = bundle.manifest.sourceFingerprints[source];
    const actualSource = stateFingerprint(source, checkpoint.state);
    if (expectedSource && actualSource !== expectedSource) errors.push(`checkpoint_source_fingerprint_mismatch:${source}`);
  }
  const sourceAggregateFingerprint = canonicalSha256(sources.map(({ source, checkpoint }) => ({
    source,
    runId: checkpoint.runId,
    corpusFingerprint: checkpoint.corpusFingerprint,
    stateFingerprint: stateFingerprint(source, checkpoint.state),
  })));
  if (errors.length > 0) return { status: "REJECTED", customerKey, runId: bundle.manifest.runId, corpusFingerprint: expectedCorpusFingerprint, sourceAggregateFingerprint, observations: [], errors: [...new Set(errors)].sort() };

  const at = { runId: bundle.manifest.runId, observedAt: bundle.manifest.createdAt };
  const observations: AprCaseStatusObservation[] = [];
  const commonItem = bundle.common?.state.items.find((item) => item.customerKey === customerKey);
  if (commonItem) observations.push(observeAprCommonPreflight(commonItem, at));
  else errors.push("case_missing_from_common_preflight");
  const batchItem = bundle.infissiBatch?.state.items.find((item) => item.customerKey === customerKey);
  if (batchItem) observations.push(observeAprInfissiBatchProductGate(batchItem, at));
  if (bundle.infissiMapping?.state.item?.customerKey === customerKey) {
    const mapping = observeAprInfissiMappingProductGate(bundle.infissiMapping.state, at);
    if (mapping) observations.push(mapping);
  }
  const deepItem = bundle.deepReview?.state.items.find((item) => item.customerKey === customerKey);
  if (deepItem) observations.push(observeAprDeepReview(deepItem, at));
  const executionItem = bundle.execution?.state.items.find((item) => item.customerKey === customerKey);
  if (executionItem) observations.push(observeAprDraftExecution(executionItem, at));

  const commonObservation = observations.find((item) => item.source === "preflight_common");
  const productObservations = observations.filter((item) => item.source === "product_gate");
  if (commonObservation && productObservations.length <= 1) {
    const policy = deriveAprCaseSourcePolicy({ commonStatus: commonObservation.status, productStatus: productObservations[0]?.status,
      executionPresent: Boolean(executionItem), serverVerificationPresent: false });
    if (!productObservations.length && policy.product_gate === "not_applicable_expected") observations.push(createAprNotApplicableObservation({ source: "product_gate", customerKey, ...at }));
    if (!deepItem && policy.deep_review === "not_applicable_expected") observations.push(createAprNotApplicableObservation({ source: "deep_review", customerKey, ...at }));
    if (!executionItem && policy.execution === "not_applicable_expected") observations.push(createAprNotApplicableObservation({ source: "execution", customerKey, ...at }));
    observations.push(createAprNotApplicableObservation({ source: "checkpoint", customerKey, ...at }));
  }
  const blockerCodes = [...new Set(observations.flatMap((item) => item.blockerCodes))].sort();
  const rawBlockedStatePresent = commonItem?.state === "blocked_case"
    || batchItem?.state === "blocked_case"
    || bundle.infissiMapping?.state.item?.customerKey === customerKey && bundle.infissiMapping.state.item.caseTruth === "OPERATOR_REQUIRED"
    || deepItem && ["technical_repair", "operator_required", "business_rule_required"].includes(deepItem.state)
    || executionItem?.state === "operator_intervention";
  const structuredBlockersMissing = Boolean(rawBlockedStatePresent) && blockerCodes.length === 0;
  if (structuredBlockersMissing) errors.push("structured_blockers_missing_for_blocked_observation");
  observations.push(observeAprStructuredBlockers({ customerKey, ...at, blockerCodes: structuredBlockersMissing ? null : blockerCodes }));
  return { status: errors.length ? "REJECTED" : "COLLECTED", customerKey, runId: bundle.manifest.runId, corpusFingerprint: expectedCorpusFingerprint,
    sourceAggregateFingerprint, observations, errors: [...new Set(errors)].sort() };
}
