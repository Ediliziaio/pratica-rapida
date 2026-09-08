import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const VERSION = "apr-terminal-observability-snapshot-v1";

function storeRootFor(cohortRoot) {
  const resolved = path.resolve(cohortRoot);
  const marker = `${path.sep}cohorts${path.sep}`;
  const index = resolved.indexOf(marker);
  const base = index >= 0 ? resolved.slice(0, index) : resolved;
  return path.join(base, "terminal-observability");
}

function atomicWrite(target, value) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function previousSnapshot(target) {
  if (!existsSync(target)) return null;
  try { return JSON.parse(readFileSync(target, "utf8")); } catch { return null; }
}

function hasPersistedTechnicalCaseEvidence(entry) {
  const evidenceIds = Array.isArray(entry?.serverEvidenceIds) ? entry.serverEvidenceIds : [];
  const hasTypedEvidence = evidenceIds.some((value) => /^driver-error-[a-f0-9]{16,64}$/.test(String(value)));
  const hasScopedReason = /Errore circoscritto alla pratica:\s*apr_(?:cdp|enea)_/i.test(String(entry?.reason ?? ""));
  return hasTypedEvidence && hasScopedReason;
}

function hasPersistedAmbiguousMutationEvidence(entry) {
  const evidenceIds = Array.isArray(entry?.serverEvidenceIds) ? entry.serverEvidenceIds.map(String) : [];
  const hasUncertainPage = evidenceIds.some((value) => /^uncertain-page-[a-f0-9]{16,64}$/.test(value));
  const hasFailedReadOnlyProbe = evidenceIds.some((value) => /^probe-error-[a-f0-9]{16,64}$/.test(value));
  const hasAmbiguousSaveReason = /^Esito tecnico incerto dopo il Salva di .+; nessun retry automatico\.$/.test(String(entry?.reason ?? ""));
  const hasNoOperatorBlockers = Array.isArray(entry?.operatorGateBlockers) && entry.operatorGateBlockers.length === 0;
  return hasUncertainPage && hasFailedReadOnlyProbe && hasAmbiguousSaveReason && hasNoOperatorBlockers;
}

function terminalCaseTruth(input, truth) {
  const explicitCustomerKey = String(input.customerKey ?? "").trim();
  const entryCustomerKey = String(input.entry?.customerKey ?? "").trim();
  if (explicitCustomerKey && entryCustomerKey && explicitCustomerKey !== entryCustomerKey) {
    throw new Error("apr_terminal_case_truth_identity_mismatch");
  }
  const customerKey = explicitCustomerKey || entryCustomerKey;
  if (!customerKey) return null;
  const reportBlockers = Array.isArray(input.entry?.operatorGateBlockers)
    ? input.entry.operatorGateBlockers.map((blocker) => ({
      code: String(blocker?.code ?? blocker?.blockId ?? "operator_required"),
      message: blocker?.message ? String(blocker.message) : undefined,
      question: blocker?.question ? String(blocker.question) : undefined,
    }))
    : [];
  if (truth.consistency === "INCONSISTENT") return { customerKey, status: "INCONSISTENT", hasProblem: null, blockerCount: 0, blockerCodes: [], statement: truth.reason, reportBlockers: [] };
  if (truth.publicStatus === "TECHNICAL_BLOCK") return { customerKey, status: "TECHNICAL_BLOCK", hasProblem: null, blockerCount: 0, blockerCodes: [], statement: truth.reason, reportBlockers: [] };
  if (input.kind === "saved") return { customerKey, status: "READY", hasProblem: false, blockerCount: 0, blockerCodes: [], statement: "Nessun problema: bozza TEST completa e verificata read-only.", reportBlockers: [] };
  if (reportBlockers.length > 0) return { customerKey, status: "blocked_case", hasProblem: true, blockerCount: reportBlockers.length, blockerCodes: reportBlockers.map((blocker) => blocker.code), statement: truth.reason, reportBlockers };
  // Un errore tecnico tipizzato, isolato per consentire alla coda di
  // proseguire, non viene trasformato artificialmente in blocker operatore.
  return { customerKey, status: "TECHNICAL_BLOCK", hasProblem: null, blockerCount: 0, blockerCodes: [], statement: truth.reason, reportBlockers: [] };
}

export function classifySequencerTerminalTruth({ kind, entry, verified, reason }) {
  const complete = entry?.state === "saved" && entry?.completedPageIds?.length === entry?.expectedPageIds?.length && verified === true;
  if (kind === "saved" && complete) return { lifecycleState: "completed", publicStatus: "IDLE", consistency: "CONSISTENT", reason: "Bozza TEST completa e verificata read-only dal finalizzatore.", nextAction: "Nessuna azione esterna consentita." };
  if (kind === "common_technical") return { lifecycleState: "technical_stop", publicStatus: "TECHNICAL_BLOCK", consistency: "CONSISTENT", reason: reason ?? "Difetto tecnico comune persistito dal sequencer.", nextAction: "Correggere il difetto tecnico comune prima di proseguire." };
  if (kind === "case_block" && entry?.state === "technical_block") return { lifecycleState: "technical_stop", publicStatus: "TECHNICAL_BLOCK", consistency: "CONSISTENT", reason: entry.reason ?? reason ?? "Difetto tecnico persistito.", nextAction: entry.nextAction ?? "Correggere il difetto tecnico." };
  if (kind === "case_block" && entry?.state === "operator_intervention" && (hasPersistedTechnicalCaseEvidence(entry) || hasPersistedAmbiguousMutationEvidence(entry))) return { lifecycleState: "technical_stop", publicStatus: "TECHNICAL_BLOCK", consistency: "CONSISTENT", reason: entry.reason ?? reason ?? "Difetto tecnico tipizzato persistito.", nextAction: "Correggere il difetto tecnico prima di una nuova esecuzione." };
  if (kind === "case_block" && entry?.state === "operator_intervention" && Array.isArray(entry.operatorGateBlockers) && entry.operatorGateBlockers.length > 0) return { lifecycleState: "completed", publicStatus: "OPERATOR_REQUIRED", consistency: "CONSISTENT", reason: entry.reason ?? reason ?? "Intervento operatore persistito.", nextAction: entry.nextAction ?? "Rispondere alla domanda operatore della pratica." };
  return { lifecycleState: "technical_stop", publicStatus: "INCONSISTENT", consistency: "INCONSISTENT", reason: reason ?? entry?.reason ?? "Le fonti terminali non concordano.", nextAction: "Correggere l'osservabilita prima di diagnosticare la pratica." };
}

export function reportStateForSequencerTerminalTruth(input) {
  const truth = classifySequencerTerminalTruth(input);
  if (truth.consistency === "INCONSISTENT") return "inconsistent";
  if (input.kind === "saved" && truth.lifecycleState === "completed") return "saved";
  if (truth.publicStatus === "OPERATOR_REQUIRED") return "operator_required";
  if (truth.publicStatus === "TECHNICAL_BLOCK") return "technical_block";
  throw new Error("apr_terminal_report_state_unmapped");
}

export function publishSequencerTerminalTruth(input) {
  const cohortRoot = path.resolve(input.cohortRoot);
  const cohortId = path.basename(cohortRoot);
  if (!/^[a-zA-Z0-9._-]{1,240}$/.test(cohortId)) throw new Error("apr_terminal_observability_cohort_id_invalid");
  const target = path.join(storeRootFor(cohortRoot), `${cohortId}.json`);
  const previous = previousSnapshot(target);
  const truth = classifySequencerTerminalTruth(input);
  const caseTruth = terminalCaseTruth(input, truth);
  const observedAt = input.observedAt ?? new Date().toISOString();
  const snapshot = {
    version: VERSION,
    revision: (previous?.revision ?? 0) + 1,
    snapshotId: `apr-terminal-${cohortId}-${randomUUID()}`,
    cohortId,
    cohortRoot,
    observedAt,
    terminal: true,
    lifecycleState: truth.lifecycleState,
    aprStatus: {
      publicStatus: truth.publicStatus,
      source: "sequencer_finalizer",
      executionStatus: input.entry?.state ?? (input.kind === "common_technical" ? "technical_stop" : "unresolved"),
      workerStatus: "quiesced",
      currentCustomerKey: null,
      reason: truth.reason,
      nextAction: truth.nextAction,
      consistency: truth.consistency,
    },
    sourceRevisions: { journal: input.journalRevision ?? 0, execution: input.executionRevision ?? 0, worker: input.workerRevision ?? 0 },
    sourceFingerprints: { execution: input.executionFingerprint ?? null, workerIdentity: input.workerIdentity ?? null },
    caseTruth,
    safety: { previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
  };
  atomicWrite(target, snapshot);
  return snapshot;
}
