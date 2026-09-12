import type { AprCrmLocalPreflightItem } from "./crmLocalPreflight";
import type { AprInfissiBatchItem } from "./infissiBatchPreflight";
import type { AprInfissiLocalMappingState } from "./infissiLocalMappingPreflight";
import type { DeepReviewItem } from "./deepCaseReview";
import type { AprEneaDraftExecutionItem } from "./eneaDraftExecution";
import type { AprCaseBlockerApplicability, AprCaseStatusObservation } from "./aprMonotonicArtifacts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { commonBlockerProductModules } from "./commonBlockerApplicability";
import type { AprOuterWatchdogStallState } from "./outerWatchdogStall";
import { APR_OUTER_WATCHDOG_STALL_BLOCKER_CODE } from "./outerWatchdogStall";

export const APR_CASE_STATUS_OBSERVATION_ADAPTERS_VERSION = "apr-case-status-observation-adapters-v1" as const;

interface ObservationContext { runId: string; observedAt: string }

function context(input: ObservationContext) {
  if (!input.runId.trim()) throw new Error("apr_case_observation_run_id_empty");
  if (!Number.isFinite(new Date(input.observedAt).getTime())) throw new Error("apr_case_observation_timestamp_invalid");
  return input;
}

function observation(input: Omit<AprCaseStatusObservation, "sourceFingerprint"> & { fingerprintSource: unknown }): AprCaseStatusObservation {
  const { fingerprintSource, ...value } = input;
  return { ...value, sourceFingerprint: canonicalSha256(fingerprintSource) };
}

function commonBlockerApplicability(blocker: { code: string; field?: string | null; reason?: string; message?: string }): AprCaseBlockerApplicability {
  return {
    code: blocker.code,
    productModules: [...commonBlockerProductModules(blocker)],
  };
}

export function observeAprCommonPreflight(item: AprCrmLocalPreflightItem, input: ObservationContext): AprCaseStatusObservation {
  context(input);
  const blockers = [...(item.report?.blockers ?? []), ...(item.report?.eneaPayloadAudit?.blockers ?? [])];
  const blockerCodes = [...new Set(blockers.map((blocker) => blocker.code))].sort();
  const status = item.state === "ready_local_plan" && item.report?.outcome === "ready_local_plan" && blockerCodes.length === 0 ? "PASS"
    : item.state === "blocked_case" && item.report?.outcome === "blocked_case" && blockerCodes.length > 0 ? "BLOCKED"
      : item.state === "queued" || item.state === "processing" ? "IN_PROGRESS"
        : item.state === "deferred_operator" ? "DEFERRED" : "INCONSISTENT";
  return observation({ source: "preflight_common", stage: "COMMON_PREFLIGHT", customerKey: item.customerKey, ...input, status,
    blockerCodes, classification: status === "BLOCKED" ? "UNCLASSIFIED" : "NONE",
    blockerApplicability: blockers.map(commonBlockerApplicability),
    fingerprintSource: { state: item.state, report: item.report } });
}

export function observeAprScreeningProductGate(item: AprCrmLocalPreflightItem, input: ObservationContext): AprCaseStatusObservation | null {
  context(input);
  const report = item.report;
  const payloadAudit = report?.eneaPayloadAudit;
  const portalGate = payloadAudit?.portalGate;
  if (!report || !payloadAudit || !portalGate) return null;

  const screeningIdentified = report.products.length > 0
    || portalGate.screeningItemCount > 0
    || portalGate.supportedPages.includes("Schermature solari");
  if (!screeningIdentified) return null;

  const blockerCodes = [...new Set(payloadAudit.blockers.map((blocker) => blocker.code))].sort();
  const status = portalGate.status === "ready"
    ? item.state === "ready_local_plan"
      && report.outcome === "ready_local_plan"
      && payloadAudit.draftReady
      && blockerCodes.length === 0 ? "PASS" : "INCONSISTENT"
    : blockerCodes.length > 0 ? "BLOCKED" : "INCONSISTENT";
  return observation({ source: "product_gate", stage: "PRODUCT_GATE", customerKey: item.customerKey, ...input, status,
    blockerCodes, classification: status === "BLOCKED" ? "UNCLASSIFIED" : "NONE",
    productModule: "screening",
    fingerprintSource: { state: item.state, outcome: report.outcome, products: report.products, payloadAudit } });
}

export function observeAprInfissiBatchProductGate(item: AprInfissiBatchItem, input: ObservationContext): AprCaseStatusObservation {
  context(input);
  const blockerCodes = [...new Set(item.report?.blockers.map((blocker) => blocker.code) ?? [])].sort();
  const status = item.state === "ready_local_plan" && item.report?.outcome === "ready_local_plan" && blockerCodes.length === 0 ? "PASS"
    : item.state === "blocked_case" && item.report?.outcome === "blocked_case" && blockerCodes.length > 0 ? "BLOCKED"
      : item.state === "queued" ? "IN_PROGRESS" : "INCONSISTENT";
  return observation({ source: "product_gate", stage: "PRODUCT_GATE", customerKey: item.customerKey, ...input, status,
    blockerCodes, classification: status === "BLOCKED" ? "UNCLASSIFIED" : "NONE", productModule: item.productModule ?? "infissi", fingerprintSource: { state: item.state, productModule: item.productModule ?? "infissi", report: item.report } });
}

export function observeAprMixedProductGate(input: {
  screening: AprCaseStatusObservation | null;
  infissi: AprCaseStatusObservation;
}, contextInput: ObservationContext): AprCaseStatusObservation {
  context(contextInput);
  const components = [input.screening, input.infissi].filter((item): item is AprCaseStatusObservation => Boolean(item));
  const status = !input.screening ? "MISSING"
    : components.some((item) => item.status === "INCONSISTENT" || item.status === "MISSING") ? "INCONSISTENT"
      : components.some((item) => item.status === "BLOCKED") ? "BLOCKED"
        : components.every((item) => item.status === "PASS") ? "PASS"
          : components.some((item) => item.status === "IN_PROGRESS") ? "IN_PROGRESS" : "INCONSISTENT";
  const blockerCodes = [...new Set(components.flatMap((item) => item.blockerCodes))].sort();
  return observation({
    source: "product_gate",
    stage: "PRODUCT_GATE",
    customerKey: input.infissi.customerKey,
    ...contextInput,
    status,
    blockerCodes,
    classification: status === "BLOCKED" ? "UNCLASSIFIED" : "NONE",
    productModule: "mixed",
    fingerprintSource: {
      screening: input.screening?.sourceFingerprint ?? null,
      infissi: input.infissi.sourceFingerprint,
    },
  });
}

export function observeAprInfissiMappingProductGate(state: AprInfissiLocalMappingState, input: ObservationContext): AprCaseStatusObservation | null {
  context(input);
  if (!state.item) return null;
  const blockerCodes = [...new Set(state.item.report.blockers.map((blocker) => blocker.code))].sort();
  const status = state.item.caseTruth === "READY" && state.item.report.outcome === "ready_local_plan" && blockerCodes.length === 0 ? "PASS"
    : state.item.caseTruth === "OPERATOR_REQUIRED" && state.item.report.outcome === "blocked_case" && blockerCodes.length > 0 ? "BLOCKED" : "INCONSISTENT";
  return observation({ source: "product_gate", stage: "PRODUCT_GATE", customerKey: state.item.customerKey, ...input, status,
    blockerCodes, classification: status === "BLOCKED" ? "UNCLASSIFIED" : "NONE", productModule: "infissi", fingerprintSource: { state: state.status, item: state.item } });
}

export function observeAprDeepReview(item: DeepReviewItem, input: ObservationContext): AprCaseStatusObservation {
  context(input);
  const status = item.state === "auto_resolved" ? "PASS"
    : item.state === "technical_repair" || item.state === "operator_required" || item.state === "business_rule_required" ? "BLOCKED"
      : item.state === "queued" || item.state === "reviewing" ? "IN_PROGRESS" : "INCONSISTENT";
  const classification = item.state === "technical_repair" ? "TECHNICAL"
    : item.state === "operator_required" ? "OPERATOR"
      : item.state === "business_rule_required" ? "BUSINESS" : "NONE";
  return observation({ source: "deep_review", stage: "DEEP_REVIEW", customerKey: item.customerKey, ...input, status,
    blockerCodes: [...new Set(item.blockerCodes)].sort(), classification, productModule: item.productModule, fingerprintSource: item });
}

export function observeAprOuterWatchdogStallCommonPreflight(state: AprOuterWatchdogStallState, input: ObservationContext): AprCaseStatusObservation {
  context(input);
  return observation({
    source: "preflight_common", stage: "COMMON_PREFLIGHT", customerKey: state.customerKey, ...input,
    status: "BLOCKED", blockerCodes: [APR_OUTER_WATCHDOG_STALL_BLOCKER_CODE], classification: "UNCLASSIFIED",
    fingerprintSource: { role: "outer_watchdog_stall_common_preflight", stall: state },
  });
}

/**
 * Il watchdog ha ucciso il processo prima che la deep review potesse
 * classificare il blocco. Un blocco gia' riconosciuto resta di competenza
 * dell'operatore: e' tecnico soltanto uno stallo senza alcun blocker noto.
 */
export function observeAprOuterWatchdogStallDeepReview(
  state: AprOuterWatchdogStallState,
  input: ObservationContext,
  knownBlockerCodes: readonly string[] = [],
): AprCaseStatusObservation {
  context(input);
  const businessCodes = [...new Set(knownBlockerCodes)].filter((code) => code !== APR_OUTER_WATCHDOG_STALL_BLOCKER_CODE).sort();
  const blockerCodes = businessCodes.length > 0 ? businessCodes : [APR_OUTER_WATCHDOG_STALL_BLOCKER_CODE];
  return observation({
    source: "deep_review", stage: "DEEP_REVIEW", customerKey: state.customerKey, ...input,
    status: "BLOCKED", blockerCodes,
    classification: businessCodes.length > 0 ? "OPERATOR" : "TECHNICAL",
    fingerprintSource: { role: "outer_watchdog_stall_deep_review", stall: state, blockerCodes },
  });
}

export function observeAprDraftExecution(item: AprEneaDraftExecutionItem, input: ObservationContext): AprCaseStatusObservation {
  context(input);
  const blockerCodes = [...new Set(item.operatorGateBlockers.map((blocker) => blocker.code))].sort();
  const technicalStop = Boolean(item.uncertainPageSave)
    || /(?:apr_cdp_|apr_enea_nested_page_not_persisted_after_outer_save|esito tecnico incerto|bozza completa e salvata non dimostrabile)/i.test(item.reason);
  const status = item.state === "saved" ? "COMPLETED"
    : item.state === "operator_intervention" && (blockerCodes.length > 0 || technicalStop) ? "BLOCKED"
      : item.state === "deferred_operator" ? "DEFERRED"
        : ["queued", "recovery_queued", "create_intent_recorded", "created", "filling", "save_intent_recorded"].includes(item.state) ? "IN_PROGRESS"
          : "INCONSISTENT";
  const classification = status === "BLOCKED" ? (technicalStop && blockerCodes.length === 0 ? "TECHNICAL" : "OPERATOR") : "NONE";
  return observation({ source: "execution", stage: "EXECUTION", customerKey: item.customerKey, ...input, status,
    blockerCodes, classification, fingerprintSource: item });
}
