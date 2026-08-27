import type { AprCrmLocalPreflightItem } from "./crmLocalPreflight";
import type { AprInfissiLocalMappingState } from "./infissiLocalMappingPreflight";
import type { AprInfissiBatchItem } from "./infissiBatchPreflight";
import type { AprEneaDraftExecutionItem } from "./eneaDraftExecution";

export const APR_CASE_STATUS_TRUTH_VERSION = "apr-case-status-truth-v1" as const;
export const APR_CASE_STATUS_TRUTH_RULE_ID = "system-apr-case-status-truth" as const;

export type AprCaseTruthStatus = "READY" | "BLOCKED" | "TECHNICAL_BLOCK" | "IN_PROGRESS" | "DEFERRED" | "INCONSISTENT";

export interface AprCaseStatusTruth {
  version: typeof APR_CASE_STATUS_TRUTH_VERSION;
  ruleId: typeof APR_CASE_STATUS_TRUTH_RULE_ID;
  customerKey: string;
  displayName: string;
  status: AprCaseTruthStatus;
  hasProblem: boolean | null;
  blockerCount: number;
  blockerCodes: string[];
  statement: string;
  sourceState: AprCrmLocalPreflightItem["state"];
  reportOutcome: AprCrmLocalPreflightItem["report"] extends infer _Report ? string | null : never;
}

export function deriveAprCaseStatusTruth(item: AprCrmLocalPreflightItem): AprCaseStatusTruth {
  const localBlockers = item.report?.blockers ?? [];
  const payloadBlockers = item.report?.eneaPayloadAudit?.blockers ?? [];
  const blockers = [
    ...localBlockers,
    ...payloadBlockers
      .filter((payloadBlocker) => !localBlockers.some((blocker) => blocker.code === payloadBlocker.code))
      .map((payloadBlocker) => ({ code: payloadBlocker.code, reason: payloadBlocker.message })),
  ];
  const reportOutcome = item.report?.outcome ?? null;
  const base = {
    version: APR_CASE_STATUS_TRUTH_VERSION,
    ruleId: APR_CASE_STATUS_TRUTH_RULE_ID,
    customerKey: item.customerKey,
    displayName: item.displayName,
    blockerCount: blockers.length,
    blockerCodes: blockers.map((blocker) => blocker.code),
    sourceState: item.state,
    reportOutcome,
  };

  const portalBlocked = Boolean(item.report?.eneaPayloadAudit
    && (!item.report.eneaPayloadAudit.draftReady || item.report.eneaPayloadAudit.portalGate.status !== "ready"));
  if (item.state === "ready_local_plan" && reportOutcome === "ready_local_plan" && localBlockers.length === 0 && portalBlocked) {
    return { ...base, status: "BLOCKED", hasProblem: true, statement: `${blockers.length} campo/i ENEA mancanti o non verificati: ${blockers.map((blocker) => blocker.reason).join(" | ")}` };
  }
  if (item.state === "ready_local_plan" && reportOutcome === "ready_local_plan" && blockers.length === 0) {
    return { ...base, status: "READY", hasProblem: false, statement: "Nessun problema: piano locale APR pronto." };
  }
  if (item.state === "blocked_case" && reportOutcome === "blocked_case" && blockers.length > 0) {
    return { ...base, status: "BLOCKED", hasProblem: true, statement: `${blockers.length} blocco/i verificato/i: ${blockers.map((blocker) => blocker.reason).join(" | ")}` };
  }
  if (item.state === "queued" || item.state === "processing") {
    return { ...base, status: "IN_PROGRESS", hasProblem: null, statement: "Pratica non ancora terminale: vietato dichiarare un blocco." };
  }
  if (item.state === "deferred_operator") {
    return { ...base, status: "DEFERRED", hasProblem: null, statement: "Pratica accantonata su disposizione esplicita; non classificata automaticamente come bloccata." };
  }
  return { ...base, status: "INCONSISTENT", hasProblem: null, statement: "Stato, report e blocker non concordano: vietato diagnosticare il caso prima della correzione." };
}

export function assertAprCaseProblemClaim(truth: AprCaseStatusTruth, claim: "problem" | "no_problem") {
  if (truth.status === "INCONSISTENT" || truth.status === "TECHNICAL_BLOCK" || truth.status === "IN_PROGRESS" || truth.status === "DEFERRED") throw new Error(`apr_case_claim_not_terminal:${truth.status}`);
  if (claim === "problem" && truth.status !== "BLOCKED") throw new Error("apr_case_false_block_claim");
  if (claim === "no_problem" && truth.status !== "READY") throw new Error("apr_case_false_ready_claim");
  return true;
}

export function deriveAprInfissiMappingCaseStatusTruth(state: AprInfissiLocalMappingState): AprCaseStatusTruth | null {
  const item = state.item;
  if (!item) return null;
  const blockers = item.report.blockers;
  const base = {
    version: APR_CASE_STATUS_TRUTH_VERSION,
    ruleId: APR_CASE_STATUS_TRUTH_RULE_ID,
    customerKey: item.customerKey,
    displayName: item.displayName,
    blockerCount: blockers.length,
    blockerCodes: blockers.map((blocker) => blocker.code),
    sourceState: (item.report.outcome === "ready_local_plan" ? "ready_local_plan" : "blocked_case") as AprCrmLocalPreflightItem["state"],
    reportOutcome: item.report.outcome,
  };
  if (item.caseTruth === "READY" && item.report.outcome === "ready_local_plan" && blockers.length === 0) {
    return { ...base, status: "READY", hasProblem: false, statement: "Nessun problema: preflight locale Infissi pronto per il mapping del portale." };
  }
  if (item.caseTruth === "OPERATOR_REQUIRED" && item.report.outcome === "blocked_case" && blockers.length > 0) {
    return { ...base, status: "BLOCKED", hasProblem: true, statement: `${blockers.length} blocco/i verificato/i: ${blockers.map((blocker) => blocker.code).join(" | ")}` };
  }
  return { ...base, status: "INCONSISTENT", hasProblem: null, statement: "Stato, report e blocker Infissi non concordano: vietato diagnosticare il caso prima della correzione." };
}

export function deriveAprInfissiBatchCaseStatusTruth(item: AprInfissiBatchItem): AprCaseStatusTruth {
  const blockers = item.report?.blockers ?? [];
  const reportOutcome = item.report?.outcome ?? null;
  const base = {
    version: APR_CASE_STATUS_TRUTH_VERSION,
    ruleId: APR_CASE_STATUS_TRUTH_RULE_ID,
    customerKey: item.customerKey,
    displayName: item.displayName,
    blockerCount: blockers.length,
    blockerCodes: blockers.map((blocker) => blocker.code),
    sourceState: item.state as AprCrmLocalPreflightItem["state"],
    reportOutcome,
  };
  if (item.state === "ready_local_plan" && reportOutcome === "ready_local_plan" && blockers.length === 0) {
    return { ...base, status: "READY", hasProblem: false, statement: "Nessun problema: preflight batch Infissi pronto; gate portale separato." };
  }
  if (item.state === "blocked_case" && reportOutcome === "blocked_case" && blockers.length > 0) {
    return { ...base, status: "BLOCKED", hasProblem: true, statement: `${blockers.length} blocco/i Infissi verificato/i: ${blockers.map((blocker) => blocker.code).join(" | ")}` };
  }
  if (item.state === "queued" && item.report === null) {
    return { ...base, status: "IN_PROGRESS", hasProblem: null, statement: "Preflight Infissi non ancora terminale: vietato dichiarare un blocco." };
  }
  return { ...base, status: "INCONSISTENT", hasProblem: null, statement: "Stato, report e blocker batch Infissi non concordano: vietato diagnosticare il caso prima della correzione." };
}

/**
 * Reconciles the local/preflight truth with the independently persisted portal
 * execution checkpoint. A portal-side operator state without a matching
 * preflight blocker is deliberately INCONSISTENT: it must not be presented as
 * either a healthy READY case or as a verified business blocker.
 */
export function reconcileAprCaseTruthWithDraftExecution(
  truth: AprCaseStatusTruth,
  executionItem: AprEneaDraftExecutionItem | undefined,
): AprCaseStatusTruth {
  if (!executionItem) return truth;

  const executionInProgress = ["queued", "recovery_queued", "create_intent_recorded", "created", "filling", "save_intent_recorded"].includes(executionItem.state);
  if (executionInProgress) {
    if (truth.status === "READY") {
      return {
        ...truth,
        status: "IN_PROGRESS",
        hasProblem: null,
        statement: `Preflight pronto; esecuzione portale in corso dal checkpoint ${executionItem.state}.`,
      };
    }
    return {
      ...truth,
      status: "INCONSISTENT",
      hasProblem: null,
      statement: `Il checkpoint del portale e in corso (${executionItem.state}), ma il preflight/report non e READY: riallineare le fonti prima di dichiarare lo stato della pratica.`,
    };
  }

  if (executionItem.state === "saved" && truth.status !== "READY") {
    return {
      ...truth,
      status: "INCONSISTENT",
      hasProblem: null,
      statement: "Il checkpoint del portale registra una bozza salvata, ma il preflight/report corrente non e READY: riallineare le fonti persistenti prima di dichiarare la pratica conclusa o bloccata.",
    };
  }

  if (executionItem.state === "operator_intervention" && truth.status !== "BLOCKED") {
    const operatorGateBlockers = executionItem.operatorGateBlockers ?? [];
    if (operatorGateBlockers.length > 0) {
      return {
        ...truth,
        status: "BLOCKED",
        hasProblem: true,
        blockerCount: operatorGateBlockers.length,
        blockerCodes: operatorGateBlockers.map((blocker) => blocker.code),
        sourceState: "blocked_case",
        reportOutcome: "blocked_case",
        statement: `${operatorGateBlockers.length} blocco/i verificato/i: ${operatorGateBlockers.map((blocker) => blocker.reason).join(" | ")}`,
      };
    }
    const technicalPortalStop = Boolean(executionItem.uncertainPageSave)
      || /(?:apr_cdp_|apr_enea_nested_page_not_persisted_after_outer_save|esito tecnico incerto|la get canonica dimostra|bozza completa e salvata non dimostrabile)/i.test(executionItem.reason);
    if (truth.status === "READY" && technicalPortalStop) {
      return {
        ...truth,
        status: "BLOCKED",
        hasProblem: true,
        blockerCount: 1,
        blockerCodes: ["execution_case_operator_required"],
        sourceState: "blocked_case",
        reportOutcome: "blocked_case",
        statement: `Richiesto intervento operatore per il solo caso; la coda prosegue: ${executionItem.reason}`,
      };
    }
    return {
      ...truth,
      status: "INCONSISTENT",
      hasProblem: null,
      statement: "Preflight e report non contengono blocker, ma il checkpoint del portale richiede intervento operatore: correggere la classificazione prima di diagnosticare il caso.",
    };
  }

  return truth;
}
