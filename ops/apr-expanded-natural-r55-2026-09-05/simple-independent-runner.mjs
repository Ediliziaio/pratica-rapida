import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const sourceRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const cohortRoot = path.join(runtimeRoot, "cohorts");
const runRoot = path.join(runtimeRoot, "runs", "apr-expanded-natural-r55");
const manifestPath = path.join(sourceRoot, "ops/apr-expanded-natural-r55-2026-09-05/manifest.json");
const sequencerPath = path.join(sourceRoot, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs");
const bundlePath = path.join(runtimeRoot, "canonical-bundle/versions/92da8433-official-municipality-r55-20260905");
const node = "/usr/local/bin/node";
const noProgressMs = 7 * 60 * 1000;
const absoluteMs = 25 * 60 * 1000;
const pollMs = 5_000;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const checkpointPath = path.join(runRoot, "checkpoint.json");
const reportPath = path.join(runRoot, "report.json");
const journalPath = path.join(runRoot, "journal.ndjson");

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
    };
    child.once("exit", onExit);
  });
}
function readJson(file) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } }
function atomicWrite(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temp, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); } finally { closeSync(descriptor); }
  renameSync(temp, file);
}
function appendJournal(event, detail = {}) {
  mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  writeFileSync(journalPath, `${JSON.stringify({ at: new Date().toISOString(), event, ...detail })}\n`, { flag: "a" });
}
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
    uncertainPageSave: item.uncertainPageSave ?? null
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
    items: Array.isArray(value.items) ? value.items.map(semanticItem) : []
  };
}
function materialFingerprint(item, caseRunRoot) {
  const root = path.join(cohortRoot, `apr-pilot-${item.cohort}-global-controller-${item.customerKey}`);
  const files = [
    "cohort-seed/checkpoint.json",
    "crm-acquisition/checkpoint.json",
    "crm-original-documents/checkpoint.json",
    "crm-document-analysis/checkpoint.json",
    "crm-local-preflight/checkpoint.json",
    "infissi-batch-preflight/checkpoint.json",
    "deep-case-review/checkpoint.json",
    "enea-operational-bridge/checkpoint.json",
    "enea-draft-execution/checkpoint.json"
  ];
  const driver = readJson(path.join(root, "enea-browser-worker/cdp-driver.json"));
  const childReport = readJson(path.join(caseRunRoot, "report.json"));
  const material = {
    checkpoints: Object.fromEntries(files.map((file) => [file, semanticCheckpoint(path.join(root, file))])),
    driver: driver ? {
      status: driver.status ?? null,
      currentCustomerKey: driver.currentCustomerKey ?? null,
      eventCount: Array.isArray(driver.events) ? driver.events.length : 0,
      lastEvent: Array.isArray(driver.events) ? driver.events.at(-1)?.action ?? null : null
    } : null,
    terminal: childReport ? {
      status: childReport.status ?? null,
      processed: childReport.processed ?? 0,
      saved: childReport.saved ?? 0,
      operatorRequired: childReport.operatorRequired ?? 0,
      technicalBlock: childReport.technicalBlock ?? 0,
      inconsistent: childReport.inconsistent ?? 0
    } : null
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}
function serviceLabel(cohort, service) { return `com.praticarapida.apr-enea-cohort${cohort}-${service}`; }
function stopService(label) { spawnSync("launchctl", ["bootout", `gui/${process.getuid()}/${label}`], { stdio: "ignore" }); }
function quiesceCase(item) {
  for (const service of ["watchdog", "worker", "supervisor"]) stopService(serviceLabel(item.cohort, service));
}
function makeSingleManifest(item) {
  return {
    version: "apr-expanded-natural-single-r55-v1",
    experimentId: manifest.experimentId,
    authorizationId: manifest.authorizationId,
    authorizedAt: manifest.authorizedAt,
    mode: manifest.mode,
    selection: { total: 1, allowedStages: manifest.selection.allowedStages, excludedCustomerKeys: manifest.selection.excludedCustomerKeys },
    cases: [item],
    safety: manifest.safety
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
    source: "simple_outer_liveness_controller"
  };
}

mkdirSync(runRoot, { recursive: true, mode: 0o700 });
let state = readJson(checkpointPath) ?? {
  version: "apr-expanded-natural-r55-checkpoint-v1",
  status: "running",
  startedAt: new Date().toISOString(),
  endedAt: null,
  currentCustomerKey: null,
  total: manifest.cases.length,
  results: []
};
function persist(event, detail = {}) {
  state.updatedAt = new Date().toISOString();
  atomicWrite(checkpointPath, state);
  const counts = Object.fromEntries(["saved", "operator_required", "technical_block", "inconsistent"].map((name) => [name, state.results.filter((item) => item.state === name).length]));
  atomicWrite(reportPath, {
    version: "apr-expanded-natural-r55-report-v1",
    status: state.status,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    total: state.total,
    processed: state.results.length,
    remaining: state.total - state.results.length,
    saved: counts.saved,
    operatorRequired: counts.operator_required,
    technicalBlock: counts.technical_block,
    inconsistent: counts.inconsistent,
    currentCustomerKey: state.currentCustomerKey,
    cases: manifest.cases.map((item) => state.results.find((result) => result.customerKey === item.customerKey) ?? { ...item, state: item.customerKey === state.currentCustomerKey ? "working" : "queued" }),
    safety: { previewAttempted: false, submitAttempted: false, communicationsAttempted: false }
  });
  appendJournal(event, detail);
}

persist("simple_lot_started", { total: state.total, noProgressMs, absoluteMs });
for (const item of manifest.cases) {
  if (state.results.some((result) => result.customerKey === item.customerKey)) continue;
  state.currentCustomerKey = item.customerKey;
  persist("case_started", { customerKey: item.customerKey, cohort: item.cohort });
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
      APR_PRESERVE_CONTINUITY: "0"
    },
    stdio: ["ignore", stdout, stderr]
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
    if (now - lastProgressMs >= noProgressMs) { timeoutReason = "no_material_progress_for_7_minutes"; break; }
    if (now - startedMs >= absoluteMs) { timeoutReason = "absolute_case_limit_25_minutes"; break; }
  }
  if (timeoutReason) {
    child.kill("SIGTERM");
    const stopped = await waitForChildExit(child, 3_000);
    if (!stopped) {
      child.kill("SIGKILL");
      await waitForChildExit(child, 3_000);
    }
  }
  closeSync(stdout);
  closeSync(stderr);
  quiesceCase(item);
  const childReport = readJson(path.join(caseRunRoot, "report.json"));
  const fallbackReason = timeoutReason ?? (spawnError
    ? `single_case_runner_spawn_error:${spawnError.message}`
    : `single_case_runner_exited_without_terminal_result:${child.exitCode ?? child.signalCode ?? "unknown"}`);
  const result = resultFromChild(item, childReport, fallbackReason);
  state.results.push(result);
  state.currentCustomerKey = null;
  persist("case_terminalized", { customerKey: item.customerKey, cohort: item.cohort, state: result.state, reason: result.reason ?? null, timeoutReason });
}
state.status = "completed";
state.endedAt = new Date().toISOString();
state.currentCustomerKey = null;
persist("simple_lot_completed", { results: state.results.length });
