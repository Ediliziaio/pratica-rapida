import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  authorizeSequencerResume,
  createSessionWaitGuard,
  executionProgressFingerprint,
  observeSessionWait,
} from "./sequencerSessionGuard.mjs";
import { createVerifiedCommonTechnicalFailure, executeSequencerCaseBulkhead } from "./sequencerFailurePolicy.mjs";
import { buildPreflightWaitHeartbeat, resolveCommonPreflightBlock } from "./sequencerPreflightGuard.mjs";
import { executeWithGuaranteedCohortQuiescence, quiescePreviousAprCohorts } from "./sequencerCohortIsolation.mjs";
import { settleCaseTruthAfterWorkerQuiescence } from "./sequencerCaseFinalizer.mjs";

const cohortsRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const runRoot = process.env.APR_RUN_ROOT
  ?? "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-global-controller-test10-2026-08-29";
const cleanSource = realpathSync(process.env.APR_SOURCE_ROOT ?? process.cwd());
const sourceRoot = `${cohortsRoot}/apr-pilot-84-five-simple-tommasina`;
const sourceManifest = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/reports/apr-wide-blocker-snapshot-2026-08-26-e30a7f6.json";
const canonicalBundles = realpathSync("/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/current");
const loader = process.env.APR_TS_LOADER ?? new URL("./apr-ts-loader.mjs", import.meta.url).pathname;
const node = "/usr/local/bin/node";
const manifestPath = process.env.APR_MANIFEST_PATH
  ?? new URL("./manifest.json", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const cohortOffset = Number.parseInt(process.env.APR_COHORT_OFFSET ?? "0", 10);
if (!Number.isSafeInteger(cohortOffset) || cohortOffset < 0) throw new Error("invalid_cohort_offset");
const cases = manifest.cases.map((item) => ({ ...item, cohort: item.cohort + cohortOffset }));
const authorizationId = manifest.authorizationId;

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

function loaded(label) {
  return command("launchctl", ["print", `gui/501/${label}`], { allowFailure: true }).status === 0;
}
function running(label) {
  const result = command("launchctl", ["print", `gui/501/${label}`], { allowFailure: true });
  return result.status === 0 && /\bstate = running\b/.test(result.stdout) && /\bpid = \d+\b/.test(result.stdout);
}
function bootstrap(plist, label) {
  if (!loaded(label)) command("launchctl", ["bootstrap", "gui/501", plist], { name: `bootstrap_${label}` });
}
function bootout(label) {
  if (loaded(label)) command("launchctl", ["bootout", `gui/501/${label}`], { name: `bootout_${label}`, allowFailure: true });
}
function launchctlDomain() { return command("launchctl", ["print", `gui/${process.getuid()}`], { allowFailure: true }).stdout; }
function processList() { return command("ps", ["-axo", "pid=,command="], { allowFailure: true }).stdout; }
async function quiesceOldCohorts(current = null) {
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

async function waitFor(description, predicate, timeoutMs, onWait = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    onWait?.();
    await sleep(2000);
  }
  throw new Error(`timeout:${description}`);
}

function throwIfCommonPreflightBlocked(root, item) {
  const common = readJson(`${root}/crm-local-preflight/checkpoint.json`);
  const block = resolveCommonPreflightBlock(common, item.customerKey);
  if (block) throw new Error(`${item.customerKey}:preflight_blocked:${block.reason}`);
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

function recoverableTransientPreSave(entry) {
  const checkpoints = entry?.pageCheckpoints ?? [];
  return Boolean(entry?.draftId)
    && /apr_cdp_(?:command_timeout:Runtime\.evaluate|connection_closed|protocol_error:-32000:(?:Promise was collected|Inspected target navigated or closed))/.test(entry?.reason ?? "")
    && checkpoints.some((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)
    && checkpoints.every((checkpoint) => checkpoint.state === "saved"
      || (checkpoint.state === "staged" && checkpoint.saveAttemptCount === 1 && Boolean(checkpoint.stagedEvidenceId))
      || (checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0));
}

async function prepare(item) {
  const root = cohortRoot(item);
  const caseManifestPath = `${runRoot}/manifest-${item.cohort}.json`;
  const seedManifest = {
    version: "apr-cohort-seed-v1",
    sourceEvidenceId: authorizationId,
    candidates: [{ customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId, expectedStageType: item.stage, productModule: item.module }],
    authorizedSingleCase: { authorizationId },
    ...(item.historicalRetest ? { historicalRetest: { authorizationId, preservePriorDrafts: true } } : {}),
  };
  if (!existsSync(`${root}/cohort-seed/checkpoint.json`)) {
    writeFileSync(caseManifestPath, `${JSON.stringify(seedManifest, null, 2)}\n`);
    command(node, ["--experimental-transform-types", `--experimental-loader=${loader}`, "scripts/enea-shadow-runner/apr-cohort-seed-cli.ts", "--state-dir", root, "--history-root", cohortsRoot, "--source-root", sourceRoot, "--manifest", caseManifestPath], { name: "seed" });
  }
  const install = `${root}/install`;
  mkdirSync(install, { recursive: true, mode: 0o700 });
  for (const file of ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"]) copyFileSync(`${canonicalBundles}/${file}`, `${install}/${file}`);
  const port = 4578 + item.cohort - 153;
  command(node, ["--experimental-transform-types", `--experimental-loader=${loader}`, "scripts/enea-shadow-runner/apr-cohort-service-cli.ts", "--cohort", String(item.cohort), "--port", String(port), "--state-dir", root, "--install-dir", install, "--node", node, "--supervisor-bundle", `${install}/apr-supervisor.mjs`, "--worker-bundle", `${install}/apr-enea-worker.mjs`, "--watchdog-bundle", `${install}/apr-watchdog.mjs`], { name: "service_prepare" });
  bootstrap(`${install}/${label(item, "supervisor")}.plist`, label(item, "supervisor"));
  if (item.module === "infissi") {
    throwIfCommonPreflightBlocked(root, item);
    await waitFor(`${item.customerKey}:infissi-local-preflight`, () => {
      throwIfCommonPreflightBlocked(root, item);
      const product = readJson(`${root}/infissi-batch-preflight/checkpoint.json`);
      return product?.status === "completed" && product.items?.some((candidate) => candidate.customerKey === item.customerKey) ? product : null;
    }, 20 * 60 * 1000, createPreflightWaitHeartbeat(item, "infissi-local-preflight"));
    command(node, ["--experimental-transform-types", `--experimental-loader=${loader}`, "scripts/enea-shadow-runner/infissi-batch-preflight-cli.ts", "--state-dir", root, "--apply-required-revisions", "--reconcile-common-applicability"], { name: "infissi_required_revisions" });
    persist("case_infissi_validation_gate_prepared", { customerKey: item.customerKey, cohort: item.cohort });
  }
  await waitFor(`${item.customerKey}:preflight`, () => {
    throwIfCommonPreflightBlocked(root, item);
    const execution = readJson(`${root}/enea-draft-execution/checkpoint.json`);
    const entry = execution?.items?.find((candidate) => candidate.customerKey === item.customerKey);
    if ((entry?.state === "queued" && execution.status === "ready")
      || (entry?.state === "operator_intervention" && recoverableTransientPreSave(entry))
      || (entry?.state === "filling" && Boolean(entry.draftId))
      || (entry?.state === "saved" && entry.completedPageIds?.length === entry.expectedPageIds?.length)) return entry;
    const common = readJson(`${root}/crm-local-preflight/checkpoint.json`);
    const product = item.module === "infissi" ? readJson(`${root}/infissi-batch-preflight/checkpoint.json`) : common;
    const productItem = product?.items?.find((candidate) => candidate.customerKey === item.customerKey);
    if (productItem?.state === "blocked_case") throw new Error(`${item.customerKey}:preflight_blocked:${productItem.reason}`);
    return null;
  }, 20 * 60 * 1000, createPreflightWaitHeartbeat(item, "execution-preflight"));
  const mappingPath = `${root}/enea-operational-bridge/${item.customerKey}-mapping.json`;
  if (!existsSync(mappingPath)) command(node, ["--experimental-transform-types", `--experimental-loader=${loader}`, "scripts/enea-shadow-runner/apr-enea-operational-bridge-prepare-cli.ts", "--source-manifest", sourceManifest, "--customer-key", item.customerKey, "--output", mappingPath], { name: "bridge_prepare" });
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

function readCaseObservation(item, root) {
  const execution = readJson(`${root}/enea-draft-execution/checkpoint.json`);
  const entry = execution?.items?.find((candidate) => candidate.customerKey === item.customerKey) ?? null;
  const driver = readJson(`${root}/enea-browser-worker/cdp-driver.json`);
  const verified = Boolean(entry?.draftId && driver?.events?.some((event) => event.action === "verify_complete_draft_readonly" && event.customerKey === item.customerKey && event.draftId === entry.draftId));
  return { entry, verified };
}

async function finalCaseTruth(item, root) {
  return settleCaseTruthAfterWorkerQuiescence({
    stopWorkerServices: async () => {
      bootout(label(item, "watchdog"));
      bootout(label(item, "worker"));
    },
    workerServicesActive: () => loaded(label(item, "watchdog")) || loaded(label(item, "worker")) || running(label(item, "watchdog")) || running(label(item, "worker")),
    readObservation: () => readCaseObservation(item, root),
    wait: sleep,
  });
}

async function runCaseUnsafe(item, previous) {
  let prepared;
  try {
    prepared = await prepare(item);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.includes(`${item.customerKey}:preflight_blocked:`)) {
      const result = resultFromEntry(item, { reason });
      state.results.push(result);
      persist("case_operator_required_from_preflight", result);
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
  const terminal = await waitFor(`${item.customerKey}:execution`, () => {
    const execution = readJson(`${root}/enea-draft-execution/checkpoint.json`);
    const service = readJson(`${root}/enea-browser-worker/service.json`);
    const entry = execution?.items?.find((candidate) => candidate.customerKey === item.customerKey);
    throwIfStructuralSymptom(item, entry, service);
    if (entry?.state !== "operator_intervention") recoveryDeparted = true;
    if (entry?.state === "saved" && entry.completedPageIds?.length === entry.expectedPageIds?.length) {
      const driver = readJson(`${root}/enea-browser-worker/cdp-driver.json`);
      const verified = driver?.events?.some((event) => event.action === "verify_complete_draft_readonly" && event.customerKey === item.customerKey && event.draftId === entry.draftId);
      if (verified && service?.status === "completed") return { kind: "saved", entry, service };
    }
    if (entry?.state === "operator_intervention" && recoverableTransientPreSave(entry) && !recoveryDeparted) return null;
    if (entry && ["operator_intervention", "technical_block"].includes(entry.state)) return { kind: "case_block", entry, service };
    if (service?.status === "technical_block" && Date.now() - attachedAt >= 15_000) {
      const reason = `${entry?.reason ?? ""} ${service?.reason ?? ""}`;
      const common = /sessione ENEA|autenticazione|authentication|login|SPID|origin_rejected|browser worker non disponibile/i.test(reason) && !/Errore circoscritto alla pratica/i.test(reason);
      if (!common) return { kind: "case_block", entry: entry ?? { reason: service.reason }, service };
      const observation = observeSessionWait(sessionWaitGuard, {
        nowMs: Date.now(),
        isCommonSessionWait: true,
        workerRunning: running(label(item, "worker")),
        progressFingerprint: executionProgressFingerprint(execution, entry),
      });
      if (observation.action === "common_block") {
        return { kind: "common_block", entry: entry ?? { reason: service.reason }, service, observation };
      }
      return null;
    }
    return null;
  }, 2 * 60 * 60 * 1000);
  if (terminal.kind === "saved" || terminal.kind === "case_block") {
    const final = await finalCaseTruth(item, root);
    if (final.kind === "saved") {
      const result = { customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId, cohort: item.cohort, state: "saved", draftId: final.entry.draftId, completedPages: final.entry.completedPageIds.length, expectedPages: final.entry.expectedPageIds.length };
      state.results.push(result);
      persist("case_saved_after_worker_quiescence", result);
      return item;
    }
    const result = resultFromEntry(item, final.entry);
    state.results.push(result);
    persist(final.kind === "case_block" ? "case_operator_required_after_worker_quiescence" : "case_operator_required_unresolved_after_worker_quiescence", result);
    return item;
  }
  throw createVerifiedCommonTechnicalFailure(
    terminal.observation?.workerRunning ? "session_unavailable_after_stall_threshold" : "worker_unavailable_after_stall_threshold",
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
    isolateCase: async (failure) => {
      const final = await finalCaseTruth(item, cohortRoot(item));
      const entry = final.entry;
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
        ...resultFromEntry(item, entry ?? { reason: failure.reason }),
        reason: failure.reason,
        question: failure.question,
        technicalReason: failure.technicalReason,
        appliedRuleIds: failure.appliedRuleIds,
      });
      if (!existing) state.results.push(result);
      persist(final.kind === "saved" ? "case_saved_after_isolation_quiescence" : "case_operator_required_from_unresolved_inconsistency", result);
    },
  }), () => quiesceOldCohorts());
  if (boundary.action === "stop_batch") throw boundary.error;
  return boundary.action === "completed" ? boundary.value : item;
}

try {
  const excluded = new Set(manifest.selection.excludedCustomerKeys);
  const expectedCount = Number(manifest.selection?.total ?? cases.length);
  if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0 || cases.length !== expectedCount || new Set(cases.map((item) => item.customerKey)).size !== expectedCount) throw new Error("manifest_identity_or_count_invalid");
  if (cases.some((item) => excluded.has(item.customerKey))) throw new Error("manifest_contains_excluded_identity");
  if (cases.some((item) => !manifest.selection.allowedStages.includes(item.stage))) throw new Error("manifest_contains_disallowed_pipeline_stage");
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
  persist("run_stopped_common_technical_block", { reason: state.commonTechnicalBlock, currentCustomerKey: state.currentCustomerKey });
  process.exitCode = 2;
}
