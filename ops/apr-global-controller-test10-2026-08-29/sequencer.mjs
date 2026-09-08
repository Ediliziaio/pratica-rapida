import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import {
  authorizeSequencerResume,
  createExecutionProgressGuard,
  createSessionWaitGuard,
  executionProgressFingerprint,
  observeExecutionProgress,
  observeSessionWait,
  retireStaleTransientSequencerResults,
} from "./sequencerSessionGuard.mjs";
import { createVerifiedCommonTechnicalFailure, executeSequencerCaseBulkhead } from "./sequencerFailurePolicy.mjs";
import { buildPreflightWaitHeartbeat, isRecoverableTransientPreSave, resolveInfissiPreflightDisposition, resolvePreflightTerminalDisposition, resolveRecoveryQueuedPreflight, resolveUncertainSaveLifecycle } from "./sequencerPreflightGuard.mjs";
import { executeWithGuaranteedCohortQuiescence, loadedAprCohortServiceLabels, quiescePreviousAprCohorts, runningAprCohortProcesses } from "./sequencerCohortIsolation.mjs";
import { protectedCohortBootout } from "../../scripts/enea-shadow-runner/aprChromeKeepaliveProtection.mjs";
import { publishSequencerTerminalTruth, reportStateForSequencerTerminalTruth } from "./sequencerTerminalTruth.mjs";
import { settleCaseTruthAfterWorkerQuiescence, settleCaseTruthWhileWorkerContinues } from "./sequencerCaseFinalizer.mjs";
import { validateSequencerManifest } from "./sequencerManifestGuard.mjs";
import { installGovernedBundleSet } from "./sequencerGovernedBundleSet.mjs";

const cohortsRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const runRoot = process.env.APR_RUN_ROOT
  ?? "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-global-controller-test10-2026-08-29";
const cleanSource = realpathSync(process.env.APR_SOURCE_ROOT ?? process.cwd());
const sourceRoot = `${cohortsRoot}/apr-pilot-84-five-simple-tommasina`;
const canonicalBundles = realpathSync(process.env.APR_CANONICAL_BUNDLES
  ?? "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/current");
const loader = process.env.APR_TS_LOADER ?? new URL("./apr-ts-loader.mjs", import.meta.url).pathname;
const node = "/usr/local/bin/node";
const manifestPath = process.env.APR_MANIFEST_PATH
  ?? new URL("./manifest.json", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const cohortOffset = Number.parseInt(process.env.APR_COHORT_OFFSET ?? "0", 10);
if (!Number.isSafeInteger(cohortOffset) || cohortOffset < 0) throw new Error("invalid_cohort_offset");
const cases = Array.isArray(manifest.cases) ? manifest.cases.map((item) => ({ ...item, cohort: item.cohort + cohortOffset })) : [];
const authorizationId = manifest.authorizationId;
const preserveAprContinuity = process.env.APR_PRESERVE_CONTINUITY !== "0";
const sessionProcessMode = process.env.APR_SESSION_PROCESS_MODE === "1";
const sessionProcesses = new Map();

mkdirSync(runRoot, { recursive: true, mode: 0o700 });
const checkpointPath = `${runRoot}/checkpoint.json`;
const logPath = `${runRoot}/sequencer.log`;
const reportJsonPath = `${runRoot}/report.json`;
const reportMdPath = `${runRoot}/report.md`;
let state = existsSync(checkpointPath) ? JSON.parse(readFileSync(checkpointPath, "utf8")) : {
  version: "apr-global-controller-test10-sequencer-v1",
  authorizationId,
  startedAt: new Date().toISOString(),
  endedAt: null,
  status: "running",
  currentCustomerKey: null,
  total: cases.length,
  results: [],
  commonTechnicalBlock: null,
};

function persist(event, detail = {}) {
  state.updatedAt = new Date().toISOString();
  writeFileSync(checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
  appendFileSync(logPath, `${JSON.stringify({ at: state.updatedAt, event, ...detail })}\n`);
  writeReport();
}

function groupedReasons() {
  const grouped = new Map();
  for (const result of state.results.filter((item) => item.state !== "saved")) {
    const reason = result.reason || "Motivo non disponibile";
    const entry = grouped.get(reason) ?? [];
    entry.push(result.displayName);
    grouped.set(reason, entry);
  }
  return [...grouped.entries()].map(([reason, names]) => ({ reason, count: names.length, names }));
}

function writeReport() {
  const saved = state.results.filter((item) => item.state === "saved");
  const operator = state.results.filter((item) => item.state === "operator_required");
  const technical = state.results.filter((item) => item.state === "technical_block");
  const inconsistent = state.results.filter((item) => item.state === "inconsistent");
  const report = {
    version: "apr-global-controller-test10-report-v1",
    authorizationId,
    status: state.status,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    total: cases.length,
    processed: state.results.length,
    saved: saved.length,
    operatorRequired: operator.length,
    technicalBlock: technical.length,
    inconsistent: inconsistent.length,
    remaining: cases.length - state.results.length,
    commonTechnicalBlock: state.commonTechnicalBlock,
    groupedReasons: groupedReasons(),
    cases: cases.map((item) => state.results.find((result) => result.customerKey === item.customerKey) ?? {
      customerKey: item.customerKey,
      displayName: item.displayName,
      practiceId: item.practiceId,
      cohort: item.cohort,
      state: item.customerKey === state.currentCustomerKey ? "working" : "queued",
    }),
    safety: { previewAttempted: false, submitAttempted: false, communicationsAttempted: false },
  };
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    `# APR — verifica controllore globale, ${cases.length} pratiche rappresentative — 29 agosto 2026`,
    "",
    `Stato: ${report.status}`,
    `Elaborate: ${report.processed}/${report.total}`,
    `Bozze complete salvate: ${report.saved}`,
    `Intervento operatore: ${report.operatorRequired}`,
    `Blocchi tecnici: ${report.technicalBlock}`,
    `Incoerenti: ${report.inconsistent}`,
    `Rimanenti: ${report.remaining}`,
    "",
    "## Motivi raggruppati",
    "",
    ...(report.groupedReasons.length ? report.groupedReasons.flatMap((group) => [`- ${group.count} pratiche — ${group.reason}`, `  - ${group.names.join(", ")}`]) : ["- Nessun caso fermo."]),
    "",
    "## Esito per pratica",
    "",
    ...report.cases.map((item) => `- ${item.displayName} (${item.practiceId}) — ${item.state}${item.draftId ? ` — bozza ${item.draftId}` : ""}${item.reason ? ` — ${item.reason}` : ""}`),
    "",
    "Nessuna anteprima, invio o comunicazione autorizzati o eseguiti.",
  ];
  writeFileSync(reportMdPath, `${lines.join("\n")}\n`);
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: options.cwd ?? cleanSource, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 && !options.allowFailure) throw new Error(`${options.name ?? program}_failed:${result.status}:${result.stderr || result.stdout}`);
  return result;
}

function activeSessionProcess(label) {
  const child = sessionProcesses.get(label);
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}
function decodeXml(value) {
  return value.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}
function startSessionProcess(plist, label) {
  if (activeSessionProcess(label)) return;
  if (label.endsWith("-watchdog")) {
    persist("session_watchdog_delegated_to_outer_liveness_controller", { label, ruleId: "system-no-one-time-launch-agents-v1" });
    return;
  }
  const contents = readFileSync(plist, "utf8");
  const argumentsBlock = contents.match(/<key>ProgramArguments<\/key><array>([\s\S]*?)<\/array>/)?.[1] ?? "";
  const args = [...argumentsBlock.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((match) => decodeXml(match[1]));
  const workingDirectory = decodeXml(contents.match(/<key>WorkingDirectory<\/key><string>([\s\S]*?)<\/string>/)?.[1] ?? cleanSource);
  const stdoutPath = decodeXml(contents.match(/<key>StandardOutPath<\/key><string>([\s\S]*?)<\/string>/)?.[1] ?? `${runRoot}/${label}.stdout.log`);
  const stderrPath = decodeXml(contents.match(/<key>StandardErrorPath<\/key><string>([\s\S]*?)<\/string>/)?.[1] ?? `${runRoot}/${label}.stderr.log`);
  if (args.length < 2 || !path.isAbsolute(args[0]) || !path.isAbsolute(args[1])) throw new Error(`session_process_plist_invalid:${label}`);
  mkdirSync(path.dirname(stdoutPath), { recursive: true, mode: 0o700 });
  mkdirSync(path.dirname(stderrPath), { recursive: true, mode: 0o700 });
  const stdout = openSync(stdoutPath, "a", 0o600);
  const stderr = openSync(stderrPath, "a", 0o600);
  const child = spawn(args[0], args.slice(1), {
    cwd: workingDirectory,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", stdout, stderr],
  });
  closeSync(stdout);
  closeSync(stderr);
  child.once("exit", () => sessionProcesses.delete(label));
  sessionProcesses.set(label, child);
  persist("session_process_started_without_launch_agent", { label, pid: child.pid, ruleId: "system-no-one-time-launch-agents-v1" });
}
function stopSessionProcesses() {
  for (const child of sessionProcesses.values()) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
}
if (sessionProcessMode) {
  process.once("SIGTERM", () => { stopSessionProcesses(); process.exit(143); });
  process.once("SIGINT", () => { stopSessionProcesses(); process.exit(130); });
}
function loaded(label) {
  if (sessionProcessMode) return activeSessionProcess(label);
  return command("launchctl", ["print", `gui/501/${label}`], { allowFailure: true }).status === 0;
}
function running(label) {
  if (sessionProcessMode) return activeSessionProcess(label);
  const result = command("launchctl", ["print", `gui/501/${label}`], { allowFailure: true });
  return result.status === 0 && /\bstate = running\b/.test(result.stdout) && /\bpid = \d+\b/.test(result.stdout);
}
function bootstrap(plist, label) {
  if (sessionProcessMode) return startSessionProcess(plist, label);
  if (!loaded(label)) command("launchctl", ["bootstrap", "gui/501", plist], { name: `bootstrap_${label}` });
}
function bootout(label) {
  if (sessionProcessMode) {
    const child = sessionProcesses.get(label);
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    return;
  }
  protectedCohortBootout(label, (safeLabel) => {
    if (loaded(safeLabel)) command("launchctl", ["bootout", `gui/501/${safeLabel}`], { name: `bootout_${safeLabel}`, allowFailure: true });
  });
}
function launchctlDomain() { return sessionProcessMode ? "" : command("launchctl", ["print", `gui/${process.getuid()}`], { allowFailure: true }).stdout; }
function processList() { return command("ps", ["-axo", "pid=,command="], { allowFailure: true }).stdout; }
async function quiesceOldCohorts(current = null) {
  if (preserveAprContinuity) {
    const observedLabels = loadedAprCohortServiceLabels(launchctlDomain());
    const observedProcesses = runningAprCohortProcesses(processList());
    persist("apr_continuity_preserved_no_stop", {
      currentCustomerKey: current?.customerKey ?? null,
      observedLabels,
      observedPids: observedProcesses.map((entry) => entry.pid),
      ruleId: "system-apr-continuity-no-orchestrator-stop-v1",
    });
    return;
  }
  const currentRoot = current ? cohortRoot(current) : null;
  const result = await quiescePreviousAprCohorts({
    launchctlDomain,
    processList,
    allowedLabels: current ? [label(current, "supervisor")] : [],
    allowProcess: (entry) => Boolean(currentRoot && entry.command.includes(currentRoot) && entry.command.includes("apr-supervisor.mjs")),
    bootout,
    terminate: (pid) => { try { process.kill(pid, "SIGTERM"); } catch { /* il processo e' gia' terminato */ } },
    wait: sleep,
  });
  persist("previous_cohorts_quiescent", { currentCustomerKey: current?.customerKey ?? null, ...result });
}
function label(item, role) { return `com.praticarapida.apr-enea-cohort${item.cohort}-${role}`; }
function cohortRoot(item) { return `${cohortsRoot}/apr-pilot-${item.cohort}-global-controller-${item.customerKey}`; }
function readJson(file) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const structuralSymptomPattern = /apr_cdp_(?:command_timeout|connection_closed|socket_closed)|apr_enea_nested_page_not_persisted_after_outer_save|(?:save|salvataggio).{0,80}(?:not_confirmed|non confermat|unconfirmed)/i;

function throwIfStructuralSymptom(item, entry, service) {
  const evidence = [entry?.reason, service?.reason, service?.lastError]
    .filter(Boolean)
    .join(" | ");
  if (structuralSymptomPattern.test(evidence)) {
    throw new Error(`${item.customerKey}:case_structural_symptom:${evidence}`);
  }
}

async function waitFor(description, predicate, timeoutMs, onWait = null, onTimeout = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    onWait?.();
    await sleep(2000);
  }
  if (onTimeout) throw onTimeout();
  throw new Error(`timeout:${description}`);
}

function preflightTerminalDisposition(root, item) {
  const common = readJson(`${root}/crm-local-preflight/checkpoint.json`);
  const product = item.module === "infissi" ? readJson(`${root}/infissi-batch-preflight/checkpoint.json`) : null;
  const deepReview = readJson(`${root}/deep-case-review/checkpoint.json`);
  return resolvePreflightTerminalDisposition(common, product, deepReview, item.customerKey, item.module);
}

class PreflightTerminalError extends Error {
  constructor(disposition) {
    super(disposition.reason ?? `${disposition.block.customerKey}:preflight_${disposition.kind}:${disposition.block.reason}`);
    this.disposition = disposition;
  }
}

function persistedPreflightTerminalEntry(item, disposition) {
  const block = disposition.block;
  return {
    customerKey: item.customerKey,
    state: disposition.kind === "technical_block" ? "technical_block"
      : disposition.kind === "inconsistent" ? "inconsistent"
        : "operator_intervention",
    reason: disposition.review?.reason ?? disposition.reason ?? block.reason,
    nextAction: disposition.review?.nextAction,
    operatorGateBlockers: disposition.kind === "operator_required" ? block.operatorGateBlockers ?? [] : [],
    deepReviewClassification: disposition.review?.classification ?? null,
  };
}

function createPreflightWaitHeartbeat(item, gate) {
  let lastHeartbeatAt = 0;
  return () => {
    const now = Date.now();
    if (now - lastHeartbeatAt < 5_000) return;
    lastHeartbeatAt = now;
    const heartbeat = buildPreflightWaitHeartbeat(item, gate, new Date(now).toISOString());
    state.phase = heartbeat.phase;
    state.phaseHeartbeatAt = heartbeat.phaseHeartbeatAt;
    state.nextAction = heartbeat.nextAction;
    persist("case_preflight_wait_heartbeat", heartbeat.detail);
  };
}

async function prepare(item) {
  const root = cohortRoot(item);
  const caseManifestPath = `${runRoot}/manifest-${item.cohort}.json`;
  const seedManifest = {
    version: "apr-cohort-seed-v1",
    sourceEvidenceId: authorizationId,
    candidates: [{ customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId, expectedStageType: item.stage, productModule: item.module }],
    authorizedSingleCase: { authorizationId },
    ...(item.generationMode === "fresh_generation" ? { draftGenerationPolicy: { mode: "fresh_generation", experimentId: manifest.experimentId } } : {}),
    ...(item.historicalRetest ? { historicalRetest: { authorizationId, preservePriorDrafts: true } } : {}),
  };
  if (!existsSync(`${root}/cohort-seed/checkpoint.json`)) {
    writeFileSync(caseManifestPath, `${JSON.stringify(seedManifest, null, 2)}\n`);
    command(node, ["--experimental-transform-types", `--experimental-loader=${loader}`, "scripts/enea-shadow-runner/apr-cohort-seed-cli.ts", "--state-dir", root, "--history-root", cohortsRoot, "--source-root", sourceRoot, "--manifest", caseManifestPath], { name: "seed" });
  }
  const install = `${root}/install`;
  mkdirSync(install, { recursive: true, mode: 0o700 });
  const port = 4578 + item.cohort - 153;
  const cohortServicesAlreadyActive = ["supervisor", "worker", "watchdog"].some((service) => loaded(label(item, service)) || running(label(item, service)));
  if (!cohortServicesAlreadyActive) {
    installGovernedBundleSet(canonicalBundles, install);
    command(node, ["--experimental-transform-types", `--experimental-loader=${loader}`, "scripts/enea-shadow-runner/apr-cohort-service-cli.ts", "--cohort", String(item.cohort), "--port", String(port), "--state-dir", root, "--install-dir", install, "--node", node, "--supervisor-bundle", `${install}/apr-supervisor.mjs`, "--worker-bundle", `${install}/apr-enea-worker.mjs`, "--watchdog-bundle", `${install}/apr-watchdog.mjs`], { name: "service_prepare" });
  } else {
    persist("case_active_services_reused_without_bundle_replacement", { customerKey: item.customerKey, cohort: item.cohort, ruleId: "system-apr-continuity-no-orchestrator-stop-v1" });
  }
  bootstrap(`${install}/${label(item, "supervisor")}.plist`, label(item, "supervisor"));
  if (item.module === "infissi") {
    await waitFor(`${item.customerKey}:infissi-local-preflight`, () => {
      const common = readJson(`${root}/crm-local-preflight/checkpoint.json`);
      const product = readJson(`${root}/infissi-batch-preflight/checkpoint.json`);
      const disposition = resolveInfissiPreflightDisposition(common, product, item.customerKey);
      if (disposition.kind === "common_block") return common;
      if (disposition.kind === "inconsistent") throw new Error(disposition.reason);
      return disposition.kind === "product" ? product : null;
    }, 20 * 60 * 1000, createPreflightWaitHeartbeat(item, "infissi-local-preflight"));
    if (item.operatorPracticeBindingResolution) {
      const resolution = item.operatorPracticeBindingResolution;
      if (resolution.answer !== "confirmed_same_practice_products" || !resolution.operatorId || !resolution.commandId || !resolution.answeredAt || !resolution.note) {
        throw new Error(`${item.customerKey}:operator_practice_binding_resolution_invalid`);
      }
      command(node, ["--experimental-transform-types", `--experimental-loader=${loader}`, "scripts/enea-shadow-runner/infissi-batch-preflight-cli.ts", "--state-dir", root, "--apply-operator-practice-binding-resolution", "--practice-id", item.practiceId, "--customer-key", item.customerKey, "--operator-id", resolution.operatorId, "--command-id", resolution.commandId, "--answered-at", resolution.answeredAt, "--note", resolution.note], { name: "infissi_operator_practice_binding_resolution" });
      persist("case_infissi_operator_practice_binding_resolution_applied", { customerKey: item.customerKey, cohort: item.cohort, commandId: resolution.commandId, propagation: "forbidden" });
    }
    command(node, ["--experimental-transform-types", `--experimental-loader=${loader}`, "scripts/enea-shadow-runner/infissi-batch-preflight-cli.ts", "--state-dir", root, "--apply-required-revisions", "--reconcile-common-applicability"], { name: "infissi_required_revisions" });
    persist("case_infissi_validation_gate_prepared", { customerKey: item.customerKey, cohort: item.cohort });
  }
  await waitFor(`${item.customerKey}:preflight`, () => {
    const preflightTerminal = preflightTerminalDisposition(root, item);
    if (["operator_required", "technical_block", "inconsistent"].includes(preflightTerminal.kind)) throw new PreflightTerminalError(preflightTerminal);
    if (preflightTerminal.kind === "wait") return null;
    const execution = readJson(`${root}/enea-draft-execution/checkpoint.json`);
    const entry = execution?.items?.find((candidate) => candidate.customerKey === item.customerKey);
    const uncertainLifecycle = resolveUncertainSaveLifecycle(execution, item.customerKey, readJson(`${root}/enea-browser-worker/cdp-driver.json`));
    if (uncertainLifecycle.kind === "invalid") throw new Error(uncertainLifecycle.reason);
    const recoveryQueued = resolveRecoveryQueuedPreflight(execution, item.customerKey);
    if (recoveryQueued.kind === "invalid") throw new Error(recoveryQueued.reason);
    if ((entry?.state === "queued" && execution.status === "ready")
      || (entry?.state === "operator_intervention" && isRecoverableTransientPreSave(entry))
      || uncertainLifecycle.kind === "wait_for_probes"
      || uncertainLifecycle.kind === "wait_for_worker_resume"
      || (entry?.state === "filling" && Boolean(entry.draftId))
      || recoveryQueued.kind === "ready"
      || (entry?.state === "saved" && entry.completedPageIds?.length === entry.expectedPageIds?.length)) return entry;
    const common = readJson(`${root}/crm-local-preflight/checkpoint.json`);
    const product = item.module === "infissi" ? readJson(`${root}/infissi-batch-preflight/checkpoint.json`) : common;
    const productItem = product?.items?.find((candidate) => candidate.customerKey === item.customerKey);
    if (productItem?.state === "blocked_case") return null;
    return null;
  }, 20 * 60 * 1000, createPreflightWaitHeartbeat(item, "execution-preflight"));
  const mappingPath = `${root}/enea-operational-bridge/${item.customerKey}-mapping.json`;
  if (!existsSync(mappingPath)) command(node, ["--experimental-transform-types", `--experimental-loader=${loader}`, "scripts/enea-shadow-runner/apr-enea-operational-bridge-prepare-cli.ts", "--state-dir", root, "--customer-key", item.customerKey, "--output", mappingPath], { name: "bridge_prepare" });
  if (!existsSync(`${root}/enea-operational-bridge/checkpoint.json`)) command(node, [`${install}/apr-enea-worker.mjs`, "bridge-arm", "--state-dir", root, "--customer-key", item.customerKey, "--mapping-artifact", mappingPath, "--authorization-id", authorizationId], { name: "bridge_arm", cwd: install });
  return { root, install };
}

function resultFromEntry(item, entry, stateName = "operator_required") {
  return {
    customerKey: item.customerKey,
    displayName: item.displayName,
    practiceId: item.practiceId,
    cohort: item.cohort,
    state: stateName,
    draftId: entry?.draftId ?? null,
    completedPages: entry?.completedPageIds?.length ?? 0,
    expectedPages: entry?.expectedPageIds?.length ?? 0,
    reason: entry?.reason ?? "Pratica isolata da APR senza una motivazione leggibile.",
  };
}

function resultFromTerminalTruth(item, terminal) {
  return resultFromEntry(item, terminal.entry, reportStateForSequencerTerminalTruth(terminal));
}

function terminalPersistEvent(stateName, suffix) {
  if (stateName === "saved") return `case_saved_${suffix}`;
  if (stateName === "operator_required") return `case_operator_required_${suffix}`;
  if (stateName === "technical_block") return `case_technical_block_${suffix}`;
  return `case_inconsistent_${suffix}`;
}

function isolatedTechnicalEntry(item, failure, entry = null) {
  return {
    ...(entry ?? {}),
    customerKey: item.customerKey,
    state: "technical_block",
    reason: failure.reason,
    nextAction: failure.nextAction ?? "Correggere il difetto tecnico e rimettere in coda la sola pratica interessata.",
    operatorGateBlockers: [],
  };
}

function readCaseObservation(item, root) {
  const execution = readJson(`${root}/enea-draft-execution/checkpoint.json`);
  const entry = execution?.items?.find((candidate) => candidate.customerKey === item.customerKey) ?? null;
  const driver = readJson(`${root}/enea-browser-worker/cdp-driver.json`);
  const verified = Boolean(entry?.draftId && driver?.events?.some((event) => event.action === "verify_complete_draft_readonly" && event.customerKey === item.customerKey && event.draftId === entry.draftId));
  return { entry, verified };
}

async function finalCaseTruth(item, root) {
  const common = {
    readObservation: () => readCaseObservation(item, root),
    publishTerminalTruth: (truth) => {
      const execution = readJson(`${root}/enea-draft-execution/checkpoint.json`);
      const service = readJson(`${root}/enea-browser-worker/service.json`);
      return publishSequencerTerminalTruth({ cohortRoot: root, ...truth, customerKey: item.customerKey, executionRevision: execution?.revision ?? 0, executionFingerprint: execution?.sourceFingerprint ?? null, workerRevision: service?.revision ?? 0, workerIdentity: service?.instanceId ?? null });
    },
    onUnresolved: () => {
      state.phase = "monitoring";
      state.phaseHeartbeatAt = new Date().toISOString();
      state.nextAction = `APR continua ${item.displayName}; il sequencer attende una verita terminale concordante senza arrestare servizi.`;
      writeFileSync(checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
      writeReport();
    },
    wait: sleep,
  };
  if (preserveAprContinuity) return settleCaseTruthWhileWorkerContinues(common);
  return settleCaseTruthAfterWorkerQuiescence({
    ...common,
    stopWorkerServices: async () => {
      bootout(label(item, "watchdog"));
      bootout(label(item, "worker"));
    },
    workerServicesActive: () => loaded(label(item, "watchdog")) || loaded(label(item, "worker")) || running(label(item, "watchdog")) || running(label(item, "worker")),
  });
}

async function runCaseUnsafe(item, previous) {
  let prepared;
  try {
    prepared = await prepare(item);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof PreflightTerminalError) {
      const root = cohortRoot(item);
      const entry = persistedPreflightTerminalEntry(item, error.disposition);
      const common = readJson(`${root}/crm-local-preflight/checkpoint.json`);
      const product = readJson(`${root}/infissi-batch-preflight/checkpoint.json`);
      const deepReview = readJson(`${root}/deep-case-review/checkpoint.json`);
      const terminalSnapshot = publishSequencerTerminalTruth({
        cohortRoot: root,
        customerKey: item.customerKey,
        kind: "case_block",
        entry,
        verified: false,
        executionRevision: Math.max(common?.revision ?? 0, product?.revision ?? 0, deepReview?.revision ?? 0),
        executionFingerprint: deepReview?.sourceFingerprint ?? common?.sourceFingerprint ?? product?.sourceFingerprint ?? null,
        workerRevision: deepReview?.revision ?? 0,
        workerIdentity: `deep-review:${deepReview?.version ?? "missing"}`,
      });
      const terminal = { kind: "case_block", entry, verified: false };
      const result = { ...resultFromTerminalTruth(item, terminal), terminalSnapshotId: terminalSnapshot.snapshotId };
      state.results.push(result);
      persist(terminalPersistEvent(result.state, "from_deep_reviewed_preflight"), result);
      return item;
    }
    throw error;
  }
  const { root, install } = prepared;
  await quiesceOldCohorts(item);
  bootstrap(`${install}/${label(item, "supervisor")}.plist`, label(item, "supervisor"));
  bootstrap(`${install}/${label(item, "worker")}.plist`, label(item, "worker"));
  bootstrap(`${install}/${label(item, "watchdog")}.plist`, label(item, "watchdog"));
  persist("case_worker_started", { customerKey: item.customerKey, cohort: item.cohort });
  const attachedAt = Date.now();
  let recoveryDeparted = false;
  const sessionWaitGuard = createSessionWaitGuard();
  const executionProgressGuard = createExecutionProgressGuard();
  const terminal = await waitFor(`${item.customerKey}:execution`, () => {
    const execution = readJson(`${root}/enea-draft-execution/checkpoint.json`);
    const service = readJson(`${root}/enea-browser-worker/service.json`);
    const entry = execution?.items?.find((candidate) => candidate.customerKey === item.customerKey);
    const recoverableTransientResumePending = entry?.state === "operator_intervention"
      && isRecoverableTransientPreSave(entry)
      && !recoveryDeparted;
    if (!recoverableTransientResumePending) throwIfStructuralSymptom(item, entry, service);
    const uncertainLifecycle = resolveUncertainSaveLifecycle(execution, item.customerKey, readJson(`${root}/enea-browser-worker/cdp-driver.json`));
    if (uncertainLifecycle.kind === "invalid") throw new Error(uncertainLifecycle.reason);
    const uncertainLifecycleInFlight = uncertainLifecycle.kind === "wait_for_probes" || uncertainLifecycle.kind === "wait_for_worker_resume";
    if (entry?.state !== "operator_intervention") recoveryDeparted = true;
    if (entry?.state === "saved" && entry.completedPageIds?.length === entry.expectedPageIds?.length) {
      const driver = readJson(`${root}/enea-browser-worker/cdp-driver.json`);
      const verified = driver?.events?.some((event) => event.action === "verify_complete_draft_readonly" && event.customerKey === item.customerKey && event.draftId === entry.draftId);
      if (verified && service?.status === "completed") return { kind: "saved", entry, service };
    }
    if (recoverableTransientResumePending) return null;
    if (!uncertainLifecycleInFlight && entry && ["operator_intervention", "technical_block"].includes(entry.state)) return { kind: "case_block", entry, service };
    const progressFingerprint = executionProgressFingerprint(execution, entry);
    const workerIsRunning = running(label(item, "worker"));
    const commonSessionWait = service?.status === "login_required"
      || (service?.status === "technical_block" && /sessione ENEA|autenticazione|authentication|login|SPID|origin_rejected|browser worker non disponibile/i.test(`${entry?.reason ?? ""} ${service?.reason ?? ""}`) && !/Errore circoscritto alla pratica/i.test(`${entry?.reason ?? ""} ${service?.reason ?? ""}`));
    if (commonSessionWait && Date.now() - attachedAt >= 15_000) {
      const reason = `${entry?.reason ?? ""} ${service?.reason ?? ""}`;
      const observation = observeSessionWait(sessionWaitGuard, {
        nowMs: Date.now(),
        isCommonSessionWait: true,
        workerRunning: workerIsRunning,
        progressFingerprint,
      });
      if (observation.action === "common_block" && !preserveAprContinuity) {
        return { kind: "common_block", entry: entry ?? { reason: service.reason }, service, observation };
      }
      return null;
    }
    const progress = observeExecutionProgress(executionProgressGuard, { nowMs: Date.now(), progressFingerprint, workerRunning: workerIsRunning });
    if (progress.action === "stalled" && !preserveAprContinuity) {
      return { kind: "execution_stalled", entry, service, observation: progress };
    }
    return null;
  }, preserveAprContinuity ? Number.POSITIVE_INFINITY : 20 * 60 * 1000, createPreflightWaitHeartbeat(item, "execution-terminal-truth"), () => createVerifiedCommonTechnicalFailure(
    "execution_stalled_after_watchdog_threshold",
    `${item.customerKey}:execution_deadline_without_terminal_truth`,
    { deadlineMs: 20 * 60 * 1000, workerRunning: running(label(item, "worker")) },
  ));
  if (terminal.kind === "saved" || terminal.kind === "case_block") {
    const final = await finalCaseTruth(item, root);
    if (final.kind === "saved") {
      const result = { customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId, cohort: item.cohort, state: "saved", draftId: final.entry.draftId, completedPages: final.entry.completedPageIds.length, expectedPages: final.entry.expectedPageIds.length };
      state.results.push(result);
      persist("case_saved_after_worker_quiescence", result);
      return item;
    }
    const result = resultFromTerminalTruth(item, final);
    state.results.push(result);
    persist(terminalPersistEvent(result.state, "after_worker_quiescence"), result);
    return item;
  }
  throw createVerifiedCommonTechnicalFailure(
    terminal.kind === "execution_stalled"
      ? "execution_stalled_after_watchdog_threshold"
      : terminal.observation?.workerRunning ? "session_unavailable_after_stall_threshold" : "worker_unavailable_after_stall_threshold",
    `${item.customerKey}:common_technical_block:${terminal.entry?.reason ?? terminal.service?.reason ?? "unknown"}`,
    terminal.observation ?? {},
  );
}

async function runCase(item, previous) {
  state.currentCustomerKey = item.customerKey;
  state.phase = "preparing";
  state.phaseHeartbeatAt = new Date().toISOString();
  state.nextAction = `Preparare i controlli locali per ${item.displayName}.`;
  persist("case_preparing", { customerKey: item.customerKey, cohort: item.cohort });
  const boundary = await executeWithGuaranteedCohortQuiescence(() => executeSequencerCaseBulkhead({
    runCase: () => runCaseUnsafe(item, previous),
    isolateCase: async (failure, originalError) => {
      if (originalError instanceof Error) {
        appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), event: "case_technical_diagnostic", customerKey: item.customerKey, message: originalError.message, stack: originalError.stack ?? null })}\n`);
      }
      let final = await finalCaseTruth(item, cohortRoot(item));
      let entry = final.entry;
      if (final.kind !== "saved" && reportStateForSequencerTerminalTruth(final) === "inconsistent") {
        entry = isolatedTechnicalEntry(item, failure, entry);
        const root = cohortRoot(item);
        const execution = readJson(`${root}/enea-draft-execution/checkpoint.json`);
        const service = readJson(`${root}/enea-browser-worker/service.json`);
        publishSequencerTerminalTruth({
          cohortRoot: root,
          customerKey: item.customerKey,
          kind: "case_block",
          entry,
          verified: false,
          executionRevision: execution?.revision ?? 0,
          executionFingerprint: execution?.sourceFingerprint ?? null,
          workerRevision: service?.revision ?? 0,
          workerIdentity: service?.instanceId ?? null,
        });
        final = { kind: "case_block", entry, verified: false };
      }
      const existing = state.results.find((candidate) => candidate.customerKey === item.customerKey);
      const result = existing ?? (final.kind === "saved" ? {
        customerKey: item.customerKey,
        displayName: item.displayName,
        practiceId: item.practiceId,
        cohort: item.cohort,
        state: "saved",
        draftId: entry.draftId,
        completedPages: entry.completedPageIds.length,
        expectedPages: entry.expectedPageIds.length,
      } : {
        ...resultFromTerminalTruth(item, final),
        reason: failure.reason,
        technicalReason: failure.technicalReason,
        appliedRuleIds: failure.appliedRuleIds,
      });
      if (!existing) state.results.push(result);
      persist(terminalPersistEvent(result.state, "after_isolation_quiescence"), result);
    },
  }), () => quiesceOldCohorts());
  if (boundary.action === "stop_batch") throw boundary.error;
  return boundary.action === "completed" ? boundary.value : item;
}

try {
  validateSequencerManifest(manifest, cases);
  const transientRetirements = retireStaleTransientSequencerResults(state, {
    authorizationId,
    observations: cases.map((item) => ({
      customerKey: item.customerKey,
      cohort: item.cohort,
      lifecycle: resolveUncertainSaveLifecycle(
        readJson(`${cohortRoot(item)}/enea-draft-execution/checkpoint.json`),
        item.customerKey,
        readJson(`${cohortRoot(item)}/enea-browser-worker/cdp-driver.json`),
      ),
    })),
  });
  if (transientRetirements.length) {
    persist("stale_inconsistent_result_retired_for_uncertain_save_probe_resume", {
      retirements: transientRetirements,
      ruleId: "system-sequencer-uncertain-save-probe-lifecycle-v1",
    });
  }
  if (authorizeSequencerResume(state, authorizationId)) {
    persist("run_resumed_after_routing_isolation_fix", { resultCount: state.results.length, currentCustomerKey: state.currentCustomerKey });
  }
  await quiesceOldCohorts();
  const initialStale = [];
  let previous = initialStale;
  for (const item of cases) {
    if (state.results.some((result) => result.customerKey === item.customerKey)) {
      previous = [item];
      continue;
    }
    const finished = await runCase(item, previous);
    previous = [finished];
  }
  state.status = "completed";
  state.currentCustomerKey = null;
  state.endedAt = new Date().toISOString();
  persist("run_completed", { resultCount: state.results.length });
} catch (error) {
  state.status = "stopped_common_technical_block";
  state.endedAt = new Date().toISOString();
  state.commonTechnicalBlock = error instanceof Error ? error.message : String(error);
  if (state.currentCustomerKey) {
    const item = cases.find((candidate) => candidate.customerKey === state.currentCustomerKey);
    if (item) {
      const root = cohortRoot(item);
      const execution = readJson(`${root}/enea-draft-execution/checkpoint.json`);
      const service = readJson(`${root}/enea-browser-worker/service.json`);
      publishSequencerTerminalTruth({ cohortRoot: root, kind: "common_technical", entry: execution?.items?.find((candidate) => candidate.customerKey === item.customerKey) ?? null, customerKey: item.customerKey, verified: false, reason: state.commonTechnicalBlock, executionRevision: execution?.revision ?? 0, executionFingerprint: execution?.sourceFingerprint ?? null, workerRevision: service?.revision ?? 0, workerIdentity: service?.instanceId ?? null });
    }
  }
  persist("run_stopped_common_technical_block", { reason: state.commonTechnicalBlock, currentCustomerKey: state.currentCustomerKey });
  process.exitCode = 2;
}
