import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const sourceRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const cohortsRoot = path.join(runtimeRoot, "cohorts");
const runRoot = path.join(runtimeRoot, "runs", "apr-wide100-final-r68-20260906");
const sourceManifestPath = path.join(sourceRoot, "ops/apr-wide100-province-lineage-2026-09-02/manifest.json");
const sequencerPath = path.join(sourceRoot, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs");
const bundlePath = path.join(runtimeRoot, "canonical-bundle/versions/b52ec569-terminal-cohort-quiescence-r67-20260906");
const expectedManifestSha256 = "51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0";
const expectedWorkerSha256 = "b52ec569d32ccc340f315697f294e2e43622dfd9029cc3f8d36f880b9dd6239e";
const cohortOffset = 3270;
const node = "/usr/local/bin/node";
const noProgressMs = 7 * 60 * 1000;
const absoluteMs = 25 * 60 * 1000;
const pollMs = 5_000;
const milestoneSize = 10;
const ntfyUrl = "https://ntfy.sh/apr-giuliano-x7q2m9";

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
if (!Array.isArray(sourceManifest.cases) || sourceManifest.cases.length !== 100) throw new Error("frozen_manifest_count_invalid");
if (new Set(sourceManifest.cases.map((item) => item.practiceId)).size !== 100) throw new Error("frozen_manifest_practice_identity_invalid");
if (new Set(sourceManifest.cases.map((item) => item.customerKey)).size !== 100) throw new Error("frozen_manifest_customer_identity_invalid");
if (!Array.isArray(sourceManifest.selection?.allowedStages) || !Array.isArray(sourceManifest.selection?.excludedCustomerKeys)) {
  throw new Error("frozen_manifest_execution_contract_missing");
}
if (sha256Bytes(readFileSync(path.join(bundlePath, "apr-enea-worker.mjs"))) !== expectedWorkerSha256) {
  throw new Error("canonical_worker_hash_mismatch");
}
const manifest = {
  ...sourceManifest,
  version: "apr-wide100-final-r68-execution-envelope-v1",
  experimentId: "apr-wide100-final-r68-20260906",
  sourceManifest: sourceManifestPath,
  sourceManifestSha256: manifestSha256,
  cases: sourceManifest.cases.map((item) => ({
    ...item,
    cohort: item.cohort + cohortOffset,
    generationMode: "fresh_generation",
    historicalRetest: true,
  })),
};

const checkpointPath = path.join(runRoot, "checkpoint.json");
const reportPath = path.join(runRoot, "report.json");
const reportMarkdownPath = path.join(runRoot, "report.md");
const preflightPath = path.join(runRoot, "preflight.json");

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
function materialFingerprint(item, caseRunRoot) {
  const root = path.join(cohortsRoot, `apr-pilot-${item.cohort}-global-controller-${item.customerKey}`);
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
function serviceLabel(cohort, role) { return `com.praticarapida.apr-enea-cohort${cohort}-${role}`; }
function stopService(label) { spawnSync("launchctl", ["bootout", `gui/${process.getuid()}/${label}`], { stdio: "ignore" }); }
function quiesceCase(item) {
  for (const role of ["watchdog", "worker", "supervisor"]) stopService(serviceLabel(item.cohort, role));
}
function makeSingleManifest(item) {
  return {
    version: "apr-wide100-final-r68-single-case-v1",
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
  version: "apr-wide100-final-r68-checkpoint-v1",
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
function buildReport() {
  const value = counts();
  return {
    version: "apr-wide100-final-r68-report-v1",
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
    manifest: { path: sourceManifestPath, sha256: manifestSha256, frozenCases: 100 },
    bundle: { path: bundlePath, workerSha256: expectedWorkerSha256 },
    policy: {
      sequential: true,
      freshGeneration: true,
      noProgressTimeoutMinutes: 7,
      absoluteCaseTimeoutMinutes: 25,
      isolateAndContinue: true,
      midLotDiagnosisOrCorrection: false,
    },
    groupedReasons: groupedReasons(),
    milestoneNotifications: state.milestoneNotifications,
    cases: manifest.cases.map((item) => state.results.find((result) => result.customerKey === item.customerKey)
      ?? { customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId, cohort: item.cohort, state: item.customerKey === state.currentCustomerKey ? "working" : "queued" }),
    safety: { previewAttempted: false, submitAttempted: false, communicationsAttempted: false, operatorProgressNotificationsOnly: true },
  };
}
function reportMarkdown(report) {
  const lines = [
    "# APR — collaudo completo delle 100 pratiche, r68",
    "",
    `Aggiornato: ${report.updatedAt}`,
    `Stato: ${report.status}`,
    `Elaborate: ${report.processed}/${report.total}`,
    `Bozze complete salvate: ${report.saved}`,
    `Intervento operatore: ${report.operatorRequired}`,
    `Blocchi tecnici: ${report.technicalBlock}`,
    `Incoerenti: ${report.inconsistent}`,
    `Rimanenti: ${report.remaining}`,
    "",
    `Manifest congelato: ${report.manifest.sha256}`,
    `Bundle: ${report.bundle.path}`,
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
  const message = `APR r68 campione completo 100: ${processed}/100 processate — complete ${report.saved}, intervento operatore ${report.operatorRequired}, blocchi tecnici ${report.technicalBlock}, incoerenti ${report.inconsistent}. Report: ${reportPath}`;
  const notification = {
    processed,
    state: "intent_recorded",
    intentAt: new Date().toISOString(),
    messageSha256: sha256Bytes(message),
    target: "ntfy:apr-giuliano-x7q2m9",
  };
  state.milestoneNotifications.push(notification);
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

atomicWrite(preflightPath, {
  version: "apr-wide100-final-r68-preflight-v1",
  checkedAt: new Date().toISOString(),
  status: "passed",
  manifest: { path: sourceManifestPath, sha256: manifestSha256, count: 100, uniquePracticeIds: 100, uniqueCustomerKeys: 100 },
  cohortRange: { first: manifest.cases[0].cohort, last: manifest.cases.at(-1).cohort },
  bundle: { path: bundlePath, workerSha256: expectedWorkerSha256 },
  safety: manifest.safety,
  execution: { sequential: true, freshGeneration: true, noProgressMs, absoluteMs, milestoneSize },
});

persist("simple_lot_started", { total: state.total, noProgressMs, absoluteMs, manifestSha256, bundlePath });
for (let threshold = milestoneSize; threshold <= state.results.length; threshold += milestoneSize) await notifyMilestone(threshold);

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
      APR_PRESERVE_CONTINUITY: "0",
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
    if (now - lastProgressMs >= noProgressMs) { timeoutReason = "no_material_progress_for_7_minutes"; break; }
    if (now - startedMs >= absoluteMs) { timeoutReason = "absolute_case_limit_25_minutes"; break; }
  }
  if (timeoutReason) {
    child.kill("SIGTERM");
    const stopped = await waitForChildExit(child, 3_000);
    if (!stopped) { child.kill("SIGKILL"); await waitForChildExit(child, 3_000); }
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
  await notifyMilestone(state.results.length);
}

state.status = "completed";
state.endedAt = new Date().toISOString();
state.currentCustomerKey = null;
persist("simple_lot_completed", { results: state.results.length });
