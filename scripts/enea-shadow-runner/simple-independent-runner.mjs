import { createHash, randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Copia unica e canonica dell'orchestratore APR. Prima del 2026-09-12 esisteva in sei
// copie divergenti sotto ops/apr-*-rNN-*/, ognuna con parametri incollati a mano;
// soltanto r67 attivava APR_SESSION_PROCESS_MODE. Il rilevamento esterno della
// sessione CRM/Supabase persa e stato introdotto durante il consolidamento, non era
// presente nella copia r67 tracciata. Da qui in avanti ogni round passa i propri
// parametri tramite le variabili APR_BATCH_*; questo file non va duplicato.

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`apr_simple_runner_missing_required_env:${name}`);
  return value;
}

const selfPath = fileURLToPath(import.meta.url);
const selfSha256 = createHash("sha256").update(readFileSync(selfPath)).digest("hex");
const sourceRoot = path.resolve(path.dirname(selfPath), "..", "..");
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const cohortsRoot = path.join(runtimeRoot, "cohorts");
const runId = requireEnv("APR_BATCH_RUN_ID");
const reportTitle = requireEnv("APR_BATCH_REPORT_TITLE");
const runRoot = requireEnv("APR_BATCH_RUN_ROOT");
const sourceManifestPath = requireEnv("APR_BATCH_MANIFEST");
const sequencerPath = path.join(sourceRoot, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs");
const bundlePath = requireEnv("APR_BATCH_BUNDLE");
const expectedManifestSha256 = requireEnv("APR_BATCH_MANIFEST_SHA256");
const expectedWorkerSha256 = requireEnv("APR_BATCH_WORKER_SHA256");
const cohortOffset = Number(requireEnv("APR_BATCH_COHORT_OFFSET"));
const node = "/usr/local/bin/node";
const viteNode = path.join(sourceRoot, "node_modules/.bin/vite-node");
const regressionCliPath = path.join(sourceRoot, "scripts/enea-shadow-runner/apr-case-regression-cli.ts");
const acceptanceCliPath = path.join(sourceRoot, "scripts/enea-shadow-runner/apr-lot-acceptance-cli.ts");
const stopDispositionCliPath = path.join(sourceRoot, "scripts/enea-shadow-runner/apr-stop-disposition-cli.ts");
const faultRecoveryCliPath = path.join(sourceRoot, "scripts/enea-shadow-runner/apr-fault-recovery-cli.ts");
const noProgressMs = 7 * 60 * 1000;
const absoluteMs = 25 * 60 * 1000;
const pollMs = 5_000;
const milestoneSize = 10;
const ntfyUrl = "https://ntfy.sh/apr-giuliano-x7q2m9";
const ntfyDisabled = process.env.APR_BATCH_NTFY_DISABLED === "1";

function sha256Bytes(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function readJson(file) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } }
function atomicWrite(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`); }
  finally { closeSync(descriptor); }
  renameSync(temporary, file);
}
function appendJournal(event, detail = {}) {
  mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(runRoot, "journal.ndjson"), `${JSON.stringify({ at: new Date().toISOString(), event, ...detail })}\n`, { flag: "a" });
}
function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { cleanup(); resolve(false); }, timeoutMs);
    const onExit = () => { cleanup(); resolve(true); };
    const cleanup = () => { clearTimeout(timer); child.off("exit", onExit); };
    child.once("exit", onExit);
  });
}

const manifestBytes = readFileSync(sourceManifestPath);
const manifestSha256 = sha256Bytes(manifestBytes);
if (manifestSha256 !== expectedManifestSha256) throw new Error(`frozen_manifest_hash_mismatch:${manifestSha256}`);
const sourceManifest = JSON.parse(manifestBytes.toString("utf8"));
const expectedCount = Number(process.env.APR_BATCH_EXPECTED_COUNT || sourceManifest.cases?.length || 0);
if (!Array.isArray(sourceManifest.cases) || sourceManifest.cases.length !== expectedCount) throw new Error("frozen_manifest_count_invalid");
if (new Set(sourceManifest.cases.map((item) => item.practiceId)).size !== expectedCount) throw new Error("frozen_manifest_practice_identity_invalid");
if (new Set(sourceManifest.cases.map((item) => item.customerKey)).size !== expectedCount) throw new Error("frozen_manifest_customer_identity_invalid");
if (!Array.isArray(sourceManifest.selection?.allowedStages) || !Array.isArray(sourceManifest.selection?.excludedCustomerKeys)) {
  throw new Error("frozen_manifest_execution_contract_missing");
}
if (sha256Bytes(readFileSync(path.join(bundlePath, "apr-enea-worker.mjs"))) !== expectedWorkerSha256) {
  throw new Error("canonical_worker_hash_mismatch");
}
const manifest = {
  ...sourceManifest,
  version: "apr-sequential-independent-execution-envelope-v2",
  experimentId: runId,
  sourceManifest: sourceManifestPath,
  sourceManifestSha256: manifestSha256,
  cases: sourceManifest.cases.map((item, index) => ({
    ...item,
    cohort: cohortOffset + index + 1,
    generationMode: "fresh_generation",
    historicalRetest: true,
  })),
};

const checkpointPath = path.join(runRoot, "checkpoint.json");
const reportPath = path.join(runRoot, "report.json");
const reportMarkdownPath = path.join(runRoot, "report.md");
const preflightPath = path.join(runRoot, "preflight.json");
const faultRecoveryLedgerPath = path.join(runRoot, "fault-recovery-ledger.json");

function semanticItem(item) {
  if (!item || typeof item !== "object") return null;
  return {
    customerKey: item.customerKey ?? null,
    state: item.state ?? null,
    outcome: item.outcome ?? item.report?.outcome ?? null,
    draftId: item.draftId ?? null,
    completedPageIds: item.completedPageIds ?? [],
    expectedPageIds: item.expectedPageIds ?? [],
    currentPageId: item.currentPageId ?? item.pageId ?? null,
    blockers: item.blockers ?? item.operatorGateBlockers ?? item.report?.blockers ?? [],
    uncertainPageSave: item.uncertainPageSave ?? null,
  };
}
function semanticCheckpoint(file) {
  const value = readJson(file);
  if (!value) return null;
  return {
    version: value.version ?? null,
    status: value.status ?? null,
    currentCustomerKey: value.currentCustomerKey ?? null,
    progress: value.progress ?? null,
    items: Array.isArray(value.items) ? value.items.map(semanticItem) : [],
  };
}
function customerCohortRoot(item) {
  return path.join(cohortsRoot, `apr-pilot-${item.cohort}-global-controller-${item.customerKey}`);
}
function materialFingerprint(item, caseRunRoot) {
  const root = customerCohortRoot(item);
  const files = [
    "cohort-seed/checkpoint.json",
    "crm-acquisition/checkpoint.json",
    "crm-original-documents/checkpoint.json",
    "crm-document-analysis/checkpoint.json",
    "crm-local-preflight/checkpoint.json",
    "infissi-batch-preflight/checkpoint.json",
    "deep-case-review/checkpoint.json",
    "enea-operational-bridge/checkpoint.json",
    "enea-draft-execution/checkpoint.json",
  ];
  const driver = readJson(path.join(root, "enea-browser-worker/cdp-driver.json"));
  const childReport = readJson(path.join(caseRunRoot, "report.json"));
  return sha256Bytes(JSON.stringify({
    checkpoints: Object.fromEntries(files.map((file) => [file, semanticCheckpoint(path.join(root, file))])),
    driver: driver ? {
      status: driver.status ?? null,
      currentCustomerKey: driver.currentCustomerKey ?? null,
      eventCount: Array.isArray(driver.events) ? driver.events.length : 0,
      lastEvent: Array.isArray(driver.events) ? driver.events.at(-1)?.action ?? null : null,
    } : null,
    terminal: childReport ? {
      status: childReport.status ?? null,
      processed: childReport.processed ?? 0,
      saved: childReport.saved ?? 0,
      operatorRequired: childReport.operatorRequired ?? 0,
      technicalBlock: childReport.technicalBlock ?? 0,
      inconsistent: childReport.inconsistent ?? 0,
    } : null,
  }));
}
// Una sessione persa e una sessione mai stabilita non sono la stessa cosa.
// La copia per coorte nasce sempre in login_required: e' contabilita' locale
// creata da configure(), non una prova sulla sessione, che e' unica e vive
// nel Portachiavi e nello stato globale. Un checkpoint che ha autenticato
// almeno una volta conserva accountFingerprint e l'evento nell'audit;
// recordLoginRequired non li cancella. Senza questa distinzione ogni coorte
// nuova ferma l'intero lotto cinque secondi dopo essere nata.
function lostCrmSession(auth) {
  if (auth?.status !== "login_required") return null;
  const audit = Array.isArray(auth.audit) ? auth.audit : [];
  const everAuthenticated = Boolean(auth.accountFingerprint)
    || audit.some((event) => event?.type === "authenticated" || event?.type === "session_refreshed");
  if (!everAuthenticated) return null;
  return typeof auth.reason === "string" && auth.reason.trim()
    ? auth.reason.trim()
    : "Sessione CRM/Supabase non disponibile.";
}
function externalCrmAuthenticationFailure(item) {
  const globalAuth = readJson(path.join(runtimeRoot, "state/crm-auth/checkpoint.json"));
  const cohortAuth = readJson(path.join(customerCohortRoot(item), "crm-auth/checkpoint.json"));
  const reason = lostCrmSession(globalAuth) ?? lostCrmSession(cohortAuth);
  return reason ? `external_crm_authentication_unavailable:${reason}` : null;
}
function writeStallTrace(item, reason, startedMs, lastProgressMs, fingerprint) {
  atomicWrite(path.join(customerCohortRoot(item), "outer-watchdog-stall/checkpoint.json"), {
    version: "apr-outer-watchdog-stall-state-v1",
    customerKey: item.customerKey,
    cohort: item.cohort,
    batchRunId: runId,
    detectedAt: new Date().toISOString(),
    reason,
    startedAt: new Date(startedMs).toISOString(),
    lastProgressAt: new Date(lastProgressMs).toISOString(),
    lastObservedFingerprint: fingerprint,
  });
}
function serviceLabel(cohort, role) { return `com.praticarapida.apr-enea-cohort${cohort}-${role}`; }
function stopService(label) { spawnSync("launchctl", ["bootout", `gui/${process.getuid()}/${label}`], { stdio: "ignore" }); }
function quiesceCase(item) {
  for (const role of ["watchdog", "worker", "supervisor"]) stopService(serviceLabel(item.cohort, role));
}
function makeSingleManifest(item) {
  return {
    version: "apr-independent-batch-runner-single-case-v1",
    experimentId: manifest.experimentId,
    authorizationId: manifest.authorizationId,
    authorizedAt: manifest.authorizedAt,
    mode: manifest.mode,
    sourceManifest: sourceManifestPath,
    sourceManifestSha256: manifestSha256,
    selection: {
      total: 1,
      allowedStages: manifest.selection.allowedStages,
      excludedCustomerKeys: manifest.selection.excludedCustomerKeys,
    },
    cases: [item],
    safety: manifest.safety,
  };
}
function resultFromChild(item, childReport, fallbackReason) {
  const value = childReport?.cases?.find((entry) => entry.customerKey === item.customerKey);
  if (childReport?.processed === 1 && value && ["saved", "operator_required", "technical_block", "inconsistent"].includes(value.state)) {
    return { ...value, cohort: item.cohort, source: "single_case_apr_report" };
  }
  return {
    customerKey: item.customerKey,
    displayName: item.displayName,
    practiceId: item.practiceId,
    cohort: item.cohort,
    state: "technical_block",
    draftId: value?.draftId ?? null,
    completedPages: value?.completedPages ?? 0,
    expectedPages: value?.expectedPages ?? 0,
    reason: fallbackReason,
    source: "simple_outer_liveness_controller",
  };
}

mkdirSync(runRoot, { recursive: true, mode: 0o700 });
let state = readJson(checkpointPath) ?? {
  version: "apr-sequential-independent-checkpoint-v2",
  status: "running",
  startedAt: new Date().toISOString(),
  endedAt: null,
  currentCustomerKey: null,
  total: manifest.cases.length,
  manifestSha256,
  bundleVersion: path.basename(bundlePath),
  results: [],
  milestoneNotifications: [],
};

let faultRecoveryLedger = readJson(faultRecoveryLedgerPath) ?? {
  version: "apr-fault-recovery-ledger-v1",
  revision: 0,
  nextCohort: cohortOffset + expectedCount + 1,
  entries: [],
  audit: [],
};
if (faultRecoveryLedger.version !== "apr-fault-recovery-ledger-v1" || !Array.isArray(faultRecoveryLedger.entries) || !Array.isArray(faultRecoveryLedger.audit)) {
  throw new Error("apr_fault_recovery_ledger_invalid");
}
for (const entry of faultRecoveryLedger.entries) {
  if (entry.status === "running" && entry.pendingAction) entry.status = "scheduled";
}
function writeFaultRecoveryLedger(event, detail = {}) {
  faultRecoveryLedger.revision += 1;
  faultRecoveryLedger.audit.push({ revision: faultRecoveryLedger.revision, at: new Date().toISOString(), event, ...detail });
  atomicWrite(faultRecoveryLedgerPath, faultRecoveryLedger);
}
function scheduleFaultRecovery(item, disposition) {
  const preliminary = decideFaultRecovery(item.customerKey, disposition.text, 0);
  const key = `${item.customerKey}:${preliminary.faultClass}`;
  let entry = faultRecoveryLedger.entries.find((candidate) => candidate.key === key);
  const previousAttempts = entry?.attemptsScheduled ?? 0;
  const decision = decideFaultRecovery(item.customerKey, disposition.text, previousAttempts);
  if (!entry) {
    entry = { key, customerKey: item.customerKey, faultClass: decision.faultClass, attemptsScheduled: 0, pendingAction: null, recoveryCohort: null, status: "observed", faultText: disposition.text, lastDecision: null };
    faultRecoveryLedger.entries.push(entry);
  }
  entry.faultText = disposition.text;
  entry.lastDecision = decision;
  if (decision.action === "difetto_da_chiudere") {
    entry.pendingAction = null;
    entry.recoveryCohort = null;
    entry.status = "defect";
    writeFaultRecoveryLedger("fault_classified_as_defect", { customerKey: item.customerKey, faultClass: decision.faultClass, attemptsSpent: previousAttempts });
    return decision;
  }
  if (!entry.pendingAction) {
    entry.attemptsScheduled += 1;
    entry.pendingAction = decision.action;
    entry.recoveryCohort = faultRecoveryLedger.nextCohort++;
    entry.status = "scheduled";
    writeFaultRecoveryLedger("fault_recovery_scheduled", { customerKey: item.customerKey, faultClass: decision.faultClass, action: decision.action, attempt: entry.attemptsScheduled, cohort: entry.recoveryCohort });
  }
  return decision;
}
function pendingFaultRecovery(action, customerKey = null) {
  return faultRecoveryLedger.entries.find((entry) => entry.pendingAction === action
    && entry.status === "scheduled" && (!customerKey || entry.customerKey === customerKey)) ?? null;
}
function recoveryWorkItem(entry) {
  const source = manifest.cases.find((item) => item.customerKey === entry.customerKey);
  if (!source) throw new Error(`apr_fault_recovery_manifest_case_missing:${entry.customerKey}`);
  return { ...source, cohort: entry.recoveryCohort, recoveryAction: entry.pendingAction, recoveryAttempt: entry.attemptsScheduled };
}
function markFaultRecoveryStarted(entry) {
  entry.status = "running";
  writeFaultRecoveryLedger("fault_recovery_started", { customerKey: entry.customerKey, faultClass: entry.faultClass, action: entry.pendingAction, attempt: entry.attemptsScheduled, cohort: entry.recoveryCohort });
}
function markFaultRecoveryFinished(entry, result) {
  entry.status = "attempt_completed";
  entry.pendingAction = null;
  entry.recoveryCohort = null;
  writeFaultRecoveryLedger("fault_recovery_finished", { customerKey: entry.customerKey, faultClass: entry.faultClass, attempt: entry.attemptsScheduled, result: result.state });
}
function upsertResult(result) {
  const index = state.results.findIndex((item) => item.customerKey === result.customerKey);
  if (index < 0) state.results.push(result);
  else state.results[index] = result;
}

function counts() {
  return Object.fromEntries(["saved", "operator_required", "technical_block", "inconsistent"]
    .map((name) => [name, state.results.filter((item) => item.state === name).length]));
}
function groupedReasons() {
  const grouped = new Map();
  for (const result of state.results.filter((item) => item.state !== "saved")) {
    const reason = result.reason || "Motivo non disponibile";
    grouped.set(reason, (grouped.get(reason) ?? 0) + 1);
  }
  return [...grouped.entries()].map(([reason, count]) => ({ reason, count }));
}
function runRegressionClosureAssessment() {
  const completedAt = new Date().toISOString();
  const child = spawnSync(viteNode, [regressionCliPath, runId], {
    cwd: sourceRoot,
    env: { ...process.env, APR_REGRESSION_RUNTIME_ROOT: runtimeRoot },
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (child.error || child.status !== 0) {
    return {
      status: "failed",
      completedAt,
      exitStatus: child.status,
      error: child.error?.message ?? child.stderr?.trim() ?? "apr_case_regression_cli_failed_without_detail",
    };
  }
  try {
    const result = JSON.parse(child.stdout);
    return {
      status: "completed",
      completedAt,
      ...result,
    };
  } catch (error) {
    return {
      status: "invalid_output",
      completedAt,
      error: error instanceof Error ? error.message : String(error),
      stdoutSha256: sha256Bytes(child.stdout ?? ""),
    };
  }
}
function runAcceptanceClosureSummary() {
  const completedAt = new Date().toISOString();
  const child = spawnSync(viteNode, [acceptanceCliPath, runId], {
    cwd: sourceRoot,
    env: { ...process.env, APR_ACCEPTANCE_RUNTIME_ROOT: runtimeRoot },
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (child.error || child.status !== 0) {
    return {
      status: "failed",
      completedAt,
      exitStatus: child.status,
      error: child.error?.message ?? child.stderr?.trim() ?? "apr_lot_acceptance_cli_failed_without_detail",
    };
  }
  try {
    const result = JSON.parse(child.stdout);
    return {
      status: "completed",
      completedAt,
      ...result,
    };
  } catch (error) {
    return {
      status: "invalid_output",
      completedAt,
      error: error instanceof Error ? error.message : String(error),
      stdoutSha256: sha256Bytes(child.stdout ?? ""),
    };
  }
}
function runStopDispositionClosureAssessment() {
  const completedAt = new Date().toISOString();
  const child = spawnSync(viteNode, [stopDispositionCliPath, runId], {
    cwd: sourceRoot,
    env: { ...process.env, APR_ACCEPTANCE_RUNTIME_ROOT: runtimeRoot },
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (child.error || child.status !== 0) {
    return {
      status: "failed",
      completedAt,
      exitStatus: child.status,
      error: child.error?.message ?? child.stderr?.trim() ?? "apr_stop_disposition_cli_failed_without_detail",
    };
  }
  try {
    const result = JSON.parse(child.stdout);
    return {
      status: "completed",
      completedAt,
      ...result,
    };
  } catch (error) {
    return {
      status: "invalid_output",
      completedAt,
      error: error instanceof Error ? error.message : String(error),
      stdoutSha256: sha256Bytes(child.stdout ?? ""),
    };
  }
}
function readCaseStopDisposition(customerKey) {
  const child = spawnSync(viteNode, [stopDispositionCliPath, runId], {
    cwd: sourceRoot,
    env: { ...process.env, APR_ACCEPTANCE_RUNTIME_ROOT: runtimeRoot },
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (child.error || child.status !== 0) throw new Error(child.error?.message ?? child.stderr?.trim() ?? "apr_stop_disposition_cli_failed_without_detail");
  const report = JSON.parse(child.stdout);
  return report.disposizioni?.find((item) => item.customerKey === customerKey) ?? null;
}
function decideFaultRecovery(customerKey, faultText, previousAttempts) {
  const child = spawnSync(viteNode, [faultRecoveryCliPath, "--decide-json", JSON.stringify({ customerKey, faultText, previousAttempts })], {
    cwd: sourceRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (child.error || child.status !== 0) throw new Error(child.error?.message ?? child.stderr?.trim() ?? "apr_fault_recovery_decision_failed_without_detail");
  return JSON.parse(child.stdout);
}
function buildReport() {
  const value = counts();
  return {
    version: "apr-sequential-independent-report-v2",
    status: state.status,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    updatedAt: state.updatedAt,
    total: state.total,
    processed: state.results.length,
    remaining: state.total - state.results.length,
    saved: value.saved,
    operatorRequired: value.operator_required,
    technicalBlock: value.technical_block,
    inconsistent: value.inconsistent,
    currentCustomerKey: state.currentCustomerKey,
    manifest: { path: sourceManifestPath, sha256: manifestSha256, frozenCases: expectedCount, groups: sourceManifest.selection?.groups ?? null },
    bundle: { path: bundlePath, workerSha256: expectedWorkerSha256 },
    policy: {
      sequential: true,
      freshGeneration: true,
      noProgressTimeoutMinutes: 7,
      absoluteCaseTimeoutMinutes: 25,
      isolateAndContinue: true,
      midLotDiagnosisOrCorrection: false,
      ntfyDisabled,
    },
    groupedReasons: groupedReasons(),
    acceptanceSummary: state.acceptanceSummary ?? { status: "pending_until_lot_closure" },
    stopDisposition: state.stopDisposition ?? { status: "pending_until_lot_closure" },
    faultRecovery: {
      ledgerPath: faultRecoveryLedgerPath,
      revision: faultRecoveryLedger.revision,
      scheduledAttempts: faultRecoveryLedger.entries.reduce((sum, item) => sum + item.attemptsScheduled, 0),
      pending: faultRecoveryLedger.entries.filter((item) => item.pendingAction).length,
      defects: faultRecoveryLedger.entries.filter((item) => item.status === "defect").map((item) => item.customerKey),
    },
    regressionGuard: state.regressionGuard ?? { status: "pending_until_lot_closure" },
    milestoneNotifications: state.milestoneNotifications,
    cases: manifest.cases.map((item) => state.results.find((result) => result.customerKey === item.customerKey)
      ? { ...state.results.find((result) => result.customerKey === item.customerKey), group: item.group ?? "ungrouped" }
      : { customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId, cohort: item.cohort, group: item.group ?? "ungrouped", state: item.customerKey === state.currentCustomerKey ? "working" : "queued" }),
    safety: { previewAttempted: false, submitAttempted: false, communicationsAttempted: false, operatorProgressNotificationsOnly: !ntfyDisabled },
  };
}
function reportMarkdown(report) {
  const acceptance = report.acceptanceSummary.status === "completed" ? report.acceptanceSummary : null;
  const stopDisposition = report.stopDisposition.status === "completed" ? report.stopDisposition : null;
  const operatorQuestions = stopDisposition?.disposizioni.filter((item) => item.kind === "domanda_operatore") ?? [];
  const aprFaults = stopDisposition?.disposizioni.filter((item) => item.kind === "guasto_apr") ?? [];
  const lines = [
    `# ${reportTitle}`,
    "",
    `Salvate: ${acceptance ? acceptance.salvate : "in calcolo alla chiusura"}`,
    `Con domanda: ${acceptance ? acceptance.conDomanda : "in calcolo alla chiusura"}`,
    `Non conformi: ${acceptance ? acceptance.nonConformi : "in calcolo alla chiusura"}`,
    `Ritirate: ${acceptance ? acceptance.ritirate : "in calcolo alla chiusura"}`,
    `Domande scritte all'operatore: ${stopDisposition ? stopDisposition.domandeOperatore : "in calcolo alla chiusura"}`,
    `Guasti di APR da chiudere: ${stopDisposition ? stopDisposition.guastiApr : "in calcolo alla chiusura"}`,
    "",
    `Aggiornato: ${report.updatedAt}`,
    `Stato: ${report.status}`,
    `Elaborate: ${report.processed}/${report.total}`,
    `Bozze complete salvate: ${report.saved}`,
    `Intervento operatore: ${report.operatorRequired}`,
    `Blocchi tecnici: ${report.technicalBlock}`,
    `Incoerenti: ${report.inconsistent}`,
    `Rimanenti: ${report.remaining}`,
    `Regressioni certificate: ${report.regressionGuard.status === "completed" ? report.regressionGuard.regressioni : "non disponibili"}`,
    `Giudizi senza fascicolo: ${report.regressionGuard.status === "completed" ? report.regressionGuard.giudicateSenzaFascicolo.length : "non disponibili"}`,
    `Domande ripetute: ${report.regressionGuard.status === "completed" ? report.regressionGuard.domandeRipetute ?? 0 : "non disponibili"}`,
    "",
    `Manifest congelato: ${report.manifest.sha256}`,
    `Bundle: ${report.bundle.path}`,
    "",
    "## Domande scritte all'operatore",
    "",
    ...(operatorQuestions.length
      ? operatorQuestions.map((item) => `- ${item.displayName ?? item.customerKey} — ${item.text}`)
      : ["- Nessuna."]),
    "",
    "## Guasti di APR da chiudere",
    "",
    ...(aprFaults.length
      ? aprFaults.map((item) => `- ${item.displayName ?? item.customerKey} — ${item.text}`)
      : ["- Nessuno."]),
    "",
    "## Esiti terminali",
    "",
    ...state.results.map((item, index) => `${index + 1}. ${item.displayName} — ${item.state}${item.draftId ? ` — bozza ${item.draftId}` : ""}${item.reason ? ` — ${item.reason}` : ""}`),
    "",
    "Nessuna anteprima, invio o comunicazione al cliente autorizzati o eseguiti.",
  ];
  return `${lines.join("\n")}\n`;
}
function persist(event, detail = {}) {
  state.updatedAt = new Date().toISOString();
  atomicWrite(checkpointPath, state);
  const report = buildReport();
  atomicWrite(reportPath, report);
  atomicWrite(reportMarkdownPath, reportMarkdown(report));
  appendJournal(event, detail);
  return report;
}
function writeMilestoneReport(processed) {
  const report = buildReport();
  const stem = `report-${String(processed).padStart(3, "0")}`;
  atomicWrite(path.join(runRoot, "milestones", `${stem}.json`), report);
  atomicWrite(path.join(runRoot, "milestones", `${stem}.md`), reportMarkdown(report));
  return report;
}
async function notifyMilestone(processed) {
  if (processed === 0 || processed % milestoneSize !== 0) return;
  if (state.milestoneNotifications.some((entry) => entry.processed === processed)) return;
  const report = writeMilestoneReport(processed);
  const message = `${reportTitle}: ${processed}/${expectedCount} processate — complete ${report.saved}, intervento operatore ${report.operatorRequired}, blocchi tecnici ${report.technicalBlock}, incoerenti ${report.inconsistent}.`;
  const notification = {
    processed,
    state: ntfyDisabled ? "suppressed_by_run_policy" : "intent_recorded",
    intentAt: new Date().toISOString(),
    messageSha256: sha256Bytes(message),
    target: ntfyDisabled ? null : "ntfy:apr-giuliano-x7q2m9",
  };
  state.milestoneNotifications.push(notification);
  if (ntfyDisabled) {
    persist("milestone_notification_suppressed", { processed, messageSha256: notification.messageSha256 });
    return;
  }
  persist("milestone_notification_intent_recorded", { processed, messageSha256: notification.messageSha256 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(ntfyUrl, { method: "POST", body: message, signal: controller.signal });
    notification.state = response.ok ? "delivered" : "failed_http";
    notification.httpStatus = response.status;
    notification.completedAt = new Date().toISOString();
    persist("milestone_notification_completed", { processed, state: notification.state, httpStatus: response.status });
  } catch (error) {
    notification.state = "failed_transport_no_retry";
    notification.error = error instanceof Error ? error.message : String(error);
    notification.completedAt = new Date().toISOString();
    persist("milestone_notification_failed_without_retry", { processed, error: notification.error });
  } finally {
    clearTimeout(timer);
  }
}
async function notifyExternalAuthenticationStop(item, reason) {
  const message = `${reportTitle}: lotto fermato su ${item.displayName} per indisponibilita autenticazione CRM/Supabase. ${reason}`;
  if (ntfyDisabled) {
    persist("external_authentication_stop_notification_suppressed", { customerKey: item.customerKey, reason });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(ntfyUrl, { method: "POST", body: message, signal: controller.signal });
    persist("external_authentication_stop_notification", { customerKey: item.customerKey, delivered: response.ok, httpStatus: response.status });
  } catch (error) {
    persist("external_authentication_stop_notification_failed", { customerKey: item.customerKey, error: error instanceof Error ? error.message : String(error) });
  } finally {
    clearTimeout(timer);
  }
}

atomicWrite(preflightPath, {
  version: "apr-sequential-independent-preflight-v2",
  checkedAt: new Date().toISOString(),
  status: "passed",
  runner: { pid: process.pid, scriptPath: selfPath, scriptSha256: selfSha256 },
  manifest: { path: sourceManifestPath, sha256: manifestSha256, count: expectedCount, uniquePracticeIds: expectedCount, uniqueCustomerKeys: expectedCount, groups: sourceManifest.selection?.groups ?? null },
  cohortRange: { first: manifest.cases[0].cohort, last: manifest.cases.at(-1).cohort },
  bundle: { path: bundlePath, workerSha256: expectedWorkerSha256 },
  safety: manifest.safety,
  execution: { sequential: true, freshGeneration: true, noProgressMs, absoluteMs, milestoneSize, ntfyDisabled },
});

console.log(`apr_simple_runner_self_attestation pid=${process.pid} scriptPath=${selfPath} scriptSha256=${selfSha256}`);
persist("simple_lot_started", { total: state.total, noProgressMs, absoluteMs, manifestSha256, bundlePath, runnerScriptPath: selfPath, runnerScriptSha256: selfSha256 });
for (let threshold = milestoneSize; threshold <= state.results.length; threshold += milestoneSize) await notifyMilestone(threshold);

async function executeCase(item, recoveryAction = null) {
  state.currentCustomerKey = item.customerKey;
  persist("case_started", { customerKey: item.customerKey, cohort: item.cohort, recoveryAction, recoveryAttempt: item.recoveryAttempt ?? null });
  const caseRunRoot = path.join(runRoot, `case-${item.cohort}-${item.customerKey}`);
  mkdirSync(caseRunRoot, { recursive: true, mode: 0o700 });
  const singleManifestPath = path.join(caseRunRoot, "manifest.json");
  atomicWrite(singleManifestPath, makeSingleManifest(item));
  const stdout = openSync(path.join(caseRunRoot, "sequencer.stdout.log"), "a", 0o600);
  const stderr = openSync(path.join(caseRunRoot, "sequencer.stderr.log"), "a", 0o600);
  const child = spawn(node, [sequencerPath], {
    cwd: sourceRoot,
    env: {
      ...process.env,
      APR_SOURCE_ROOT: sourceRoot,
      APR_MANIFEST_PATH: singleManifestPath,
      APR_RUN_ROOT: caseRunRoot,
      APR_CANONICAL_BUNDLES: bundlePath,
      APR_COHORT_OFFSET: "0",
      APR_PRESERVE_CONTINUITY: "0",
      APR_SESSION_PROCESS_MODE: "1",
    },
    stdio: ["ignore", stdout, stderr],
  });
  let spawnError = null;
  child.once("error", (error) => { spawnError = error; });
  const startedMs = Date.now();
  let lastProgressMs = startedMs;
  let fingerprint = materialFingerprint(item, caseRunRoot);
  let timeoutReason = null;
  while (child.exitCode === null && child.signalCode === null) {
    await sleep(pollMs);
    const nextFingerprint = materialFingerprint(item, caseRunRoot);
    if (nextFingerprint !== fingerprint) {
      fingerprint = nextFingerprint;
      lastProgressMs = Date.now();
      persist("case_material_progress", { customerKey: item.customerKey, cohort: item.cohort, fingerprint });
    }
    const now = Date.now();
    const authenticationFailure = externalCrmAuthenticationFailure(item);
    if (authenticationFailure) { timeoutReason = authenticationFailure; break; }
    if (now - lastProgressMs >= noProgressMs) { timeoutReason = "no_material_progress_for_7_minutes"; break; }
    if (now - startedMs >= absoluteMs) { timeoutReason = "absolute_case_limit_25_minutes"; break; }
  }
  if (timeoutReason) {
    child.kill("SIGTERM");
    const stopped = await waitForChildExit(child, 3_000);
    if (!stopped) { child.kill("SIGKILL"); await waitForChildExit(child, 3_000); }
    writeStallTrace(item, timeoutReason, startedMs, lastProgressMs, fingerprint);
  }
  closeSync(stdout);
  closeSync(stderr);
  quiesceCase(item);
  const childReport = readJson(path.join(caseRunRoot, "report.json"));
  const fallbackReason = timeoutReason ?? (spawnError
    ? `single_case_runner_spawn_error:${spawnError.message}`
    : `single_case_runner_exited_without_terminal_result:${child.exitCode ?? child.signalCode ?? "unknown"}`);
  const result = resultFromChild(item, childReport, fallbackReason);
  return { result, timeoutReason };
}

async function executeAndClassify(item, recoveryEntry = null) {
  const resultCountBefore = state.results.length;
  if (recoveryEntry) markFaultRecoveryStarted(recoveryEntry);
  const { result, timeoutReason } = await executeCase(item, recoveryEntry?.pendingAction ?? null);
  upsertResult(result);
  state.currentCustomerKey = null;
  persist("case_terminalized", { customerKey: item.customerKey, cohort: item.cohort, state: result.state, reason: result.reason ?? null, timeoutReason, recoveryAttempt: item.recoveryAttempt ?? null });
  if (recoveryEntry) markFaultRecoveryFinished(recoveryEntry, result);
  if (timeoutReason?.startsWith("external_crm_authentication_unavailable:")) {
    state.status = "stopped_external_crm_authentication";
    state.endedAt = new Date().toISOString();
    persist("lot_stopped_external_crm_authentication", { customerKey: item.customerKey, cohort: item.cohort, reason: timeoutReason });
    await notifyExternalAuthenticationStop(item, timeoutReason);
    process.exitCode = 2;
    return false;
  }
  if (result.state !== "saved") {
    let disposition = null;
    try { disposition = readCaseStopDisposition(item.customerKey); }
    catch (error) {
      persist("fault_recovery_disposition_unavailable", { customerKey: item.customerKey, cohort: item.cohort, error: error instanceof Error ? error.message : String(error) });
    }
    if (disposition?.kind === "guasto_apr") {
      const decision = scheduleFaultRecovery(item, disposition);
      persist("fault_recovery_decided", { customerKey: item.customerKey, cohort: item.cohort, faultClass: decision.faultClass, action: decision.action, attemptsSpent: decision.attemptsSpent, maxAttempts: decision.maxAttempts });
    }
  }
  if (state.results.length > resultCountBefore) await notifyMilestone(state.results.length);
  return true;
}

async function processImmediateRecoveries(customerKey) {
  let pending = pendingFaultRecovery("rilavora_subito", customerKey);
  while (pending) {
    if (!await executeAndClassify(recoveryWorkItem(pending), pending)) return false;
    pending = pendingFaultRecovery("rilavora_subito", customerKey);
  }
  return true;
}

atomicWrite(faultRecoveryLedgerPath, faultRecoveryLedger);
let lotCanContinue = true;
for (const item of manifest.cases) {
  if (!await processImmediateRecoveries(item.customerKey)) { lotCanContinue = false; break; }
  if (state.results.some((result) => result.customerKey === item.customerKey)) continue;
  if (!await executeAndClassify(item)) { lotCanContinue = false; break; }
  if (!await processImmediateRecoveries(item.customerKey)) { lotCanContinue = false; break; }
}

// "rilavora_a_fine_lotto" e' una vera seconda passata dopo l'ultimo caso
// del manifest. Ogni nuova decisione resta nello stesso ledger e il tetto
// della policy rende il ciclo finito anche dopo un riavvio.
while (lotCanContinue && state.status !== "stopped_external_crm_authentication") {
  const pending = pendingFaultRecovery("rilavora_subito") ?? pendingFaultRecovery("rilavora_a_fine_lotto");
  if (!pending) break;
  lotCanContinue = await executeAndClassify(recoveryWorkItem(pending), pending);
}

if (state.status !== "stopped_external_crm_authentication") {
  const regressionGuard = runRegressionClosureAssessment();
  const acceptanceSummary = runAcceptanceClosureSummary();
  const stopDisposition = runStopDispositionClosureAssessment();
  atomicWrite(path.join(runRoot, "regression-report.json"), regressionGuard);
  atomicWrite(path.join(runRoot, "acceptance-report.json"), acceptanceSummary);
  atomicWrite(path.join(runRoot, "stop-disposition-report.json"), stopDisposition);
  state.regressionGuard = regressionGuard;
  state.acceptanceSummary = acceptanceSummary;
  state.stopDisposition = stopDisposition;
  state.status = "completed";
  state.endedAt = new Date().toISOString();
  state.currentCustomerKey = null;
  persist("simple_lot_completed", {
    results: state.results.length,
    regressionGuardStatus: regressionGuard.status,
    regressions: regressionGuard.status === "completed" ? regressionGuard.regressioni : null,
    judgedWithoutDocuments: regressionGuard.status === "completed" ? regressionGuard.giudicateSenzaFascicolo.length : null,
    repeatedOperatorQuestions: regressionGuard.status === "completed" ? regressionGuard.domandeRipetute ?? 0 : null,
    acceptanceSummaryStatus: acceptanceSummary.status,
    acceptedSaved: acceptanceSummary.status === "completed" ? acceptanceSummary.salvate : null,
    acceptedWithQuestion: acceptanceSummary.status === "completed" ? acceptanceSummary.conDomanda : null,
    nonCompliant: acceptanceSummary.status === "completed" ? acceptanceSummary.nonConformi : null,
    withdrawn: acceptanceSummary.status === "completed" ? acceptanceSummary.ritirate : null,
    stopDispositionStatus: stopDisposition.status,
    operatorQuestionsWritten: stopDisposition.status === "completed" ? stopDisposition.domandeOperatore : null,
    aprFaultsToClose: stopDisposition.status === "completed" ? stopDisposition.guastiApr : null,
  });
}
