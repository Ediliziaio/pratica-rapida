import { createHash, randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const sourceRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const operationDir = path.join(sourceRoot, "ops/apr-targeted-excel-ready-r70-2026-09-06");
const runRoot = process.env.APR_OUTER_RUN_ROOT ?? path.join(runtimeRoot, "runs/apr-targeted-excel-ready-r70-20260906");
const cohortsRoot = path.join(runtimeRoot, "cohorts");
const manifestPath = path.join(operationDir, "manifest.json");
const sequencerPath = path.join(sourceRoot, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs");
const bundlePath = process.env.APR_OUTER_BUNDLE_PATH ?? path.join(runtimeRoot, "canonical-bundle/versions/90435679-comune-rinaldi-alt-verified-r69-20260906");
const expectedWorkerSha256 = process.env.APR_OUTER_WORKER_SHA256 ?? "dcb708e6ba7bf4a54f6f4a0d864374ed26de032a34477e8e95923200974ef9cb";
const cohortOffset = Number(process.env.APR_OUTER_COHORT_OFFSET ?? "0");
const node = "/usr/local/bin/node";
const noProgressMs = 7 * 60 * 1000;
const absoluteMs = 25 * 60 * 1000;
const pollMs = 5000;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = (file) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } };
function atomicWrite(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); } finally { closeSync(descriptor); }
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
function semanticCheckpoint(file) {
  const value = readJson(file);
  if (!value) return null;
  const items = Array.isArray(value.items) ? value.items.map((item) => ({
    customerKey: item.customerKey ?? null,
    state: item.state ?? null,
    outcome: item.outcome ?? item.report?.outcome ?? null,
    draftId: item.draftId ?? null,
    completedPageIds: item.completedPageIds ?? [],
    expectedPageIds: item.expectedPageIds ?? [],
    currentPageId: item.currentPageId ?? item.pageId ?? null,
    blockers: item.blockers ?? item.operatorGateBlockers ?? item.report?.blockers ?? [],
  })) : [];
  return { status: value.status ?? null, currentCustomerKey: value.currentCustomerKey ?? null, progress: value.progress ?? null, items };
}
function materialFingerprint(item, caseRunRoot) {
  const root = path.join(cohortsRoot, `apr-pilot-${item.cohort}-global-controller-${item.customerKey}`);
  const files = [
    "cohort-seed/checkpoint.json", "crm-acquisition/checkpoint.json", "crm-original-documents/checkpoint.json",
    "crm-document-analysis/checkpoint.json", "crm-local-preflight/checkpoint.json", "infissi-batch-preflight/checkpoint.json",
    "deep-case-review/checkpoint.json", "enea-operational-bridge/checkpoint.json", "enea-draft-execution/checkpoint.json",
  ];
  const driver = readJson(path.join(root, "enea-browser-worker/cdp-driver.json"));
  const childReport = readJson(path.join(caseRunRoot, "report.json"));
  return sha256(JSON.stringify({
    checkpoints: Object.fromEntries(files.map((file) => [file, semanticCheckpoint(path.join(root, file))])),
    driver: driver ? { status: driver.status ?? null, currentCustomerKey: driver.currentCustomerKey ?? null, eventCount: Array.isArray(driver.events) ? driver.events.length : 0, lastEvent: Array.isArray(driver.events) ? driver.events.at(-1)?.action ?? null : null } : null,
    terminal: childReport ? { status: childReport.status ?? null, processed: childReport.processed ?? 0, saved: childReport.saved ?? 0, operatorRequired: childReport.operatorRequired ?? 0, technicalBlock: childReport.technicalBlock ?? 0, inconsistent: childReport.inconsistent ?? 0 } : null,
  }));
}
const serviceLabel = (cohort, role) => `com.praticarapida.apr-enea-cohort${cohort}-${role}`;
function quiesce(item) {
  for (const role of ["watchdog", "worker", "supervisor"]) spawnSync("launchctl", ["bootout", `gui/${process.getuid()}/${serviceLabel(item.cohort, role)}`], { stdio: "ignore" });
}

const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (!Array.isArray(manifest.cases) || manifest.cases.length !== manifest.selection?.total) throw new Error("manifest_count_invalid");
if (!Array.isArray(manifest.selection?.excludedCustomerKeys)) throw new Error("manifest_excluded_customer_keys_missing");
if (!Number.isSafeInteger(cohortOffset) || cohortOffset < 0) throw new Error("cohort_offset_invalid");
const executionCases = manifest.cases.map((item) => ({ ...item, cohort: item.cohort + cohortOffset }));
if (sha256(readFileSync(path.join(bundlePath, "apr-enea-worker.mjs"))) !== expectedWorkerSha256) throw new Error("bundle_worker_hash_mismatch");

const checkpointPath = path.join(runRoot, "checkpoint.json");
const reportPath = path.join(runRoot, "report.json");
mkdirSync(runRoot, { recursive: true, mode: 0o700 });
let state = readJson(checkpointPath) ?? {
  version: "apr-targeted-excel-ready-r70-checkpoint-v1", status: "running", startedAt: new Date().toISOString(), endedAt: null,
  total: executionCases.length, currentCustomerKey: null, manifestSha256: sha256(manifestBytes), bundleVersion: path.basename(bundlePath), expectedWorkerSha256, cohortOffset, results: [],
};
function persist(event, detail = {}) {
  state.updatedAt = new Date().toISOString();
  atomicWrite(checkpointPath, state);
  const count = (name) => state.results.filter((item) => item.state === name).length;
  atomicWrite(reportPath, {
    version: "apr-targeted-excel-ready-r70-report-v1", status: state.status, startedAt: state.startedAt, endedAt: state.endedAt, updatedAt: state.updatedAt,
    total: state.total, processed: state.results.length, remaining: state.total - state.results.length,
    saved: count("saved"), operatorRequired: count("operator_required"), technicalBlock: count("technical_block"), inconsistent: count("inconsistent"),
    currentCustomerKey: state.currentCustomerKey, bundleVersion: state.bundleVersion, expectedWorkerSha256,
    cases: executionCases.map((item) => state.results.find((result) => result.practiceId === item.practiceId) ?? { ...item, state: item.customerKey === state.currentCustomerKey ? "working" : "queued" }),
    safety: { generationMode: "fresh_generation", draftOnly: true, previewAttempted: false, submitAttempted: false, communicationsAttempted: false },
  });
  appendJournal(event, detail);
}
function singleManifest(item) {
  return { ...manifest, version: "apr-targeted-excel-ready-r70-single-v1", selection: { ...manifest.selection, total: 1 }, cases: [item] };
}
function terminalResult(item, childReport, fallbackReason) {
  const value = childReport?.cases?.find((entry) => entry.practiceId === item.practiceId || entry.customerKey === item.customerKey);
  if (childReport?.processed === 1 && value && ["saved", "operator_required", "technical_block", "inconsistent"].includes(value.state)) return { ...value, cohort: item.cohort, source: "single_case_apr_report" };
  return { ...item, state: "technical_block", draftId: value?.draftId ?? null, reason: fallbackReason, source: "simple_outer_liveness_controller" };
}

persist("lot_started", { total: state.total, noProgressMs, absoluteMs });
for (const item of executionCases) {
  if (state.results.some((result) => result.practiceId === item.practiceId)) continue;
  state.currentCustomerKey = item.customerKey;
  persist("case_started", { practiceId: item.practiceId, customerKey: item.customerKey, cohort: item.cohort });
  const caseRunRoot = path.join(runRoot, `case-${item.cohort}-${item.customerKey}`);
  mkdirSync(caseRunRoot, { recursive: true, mode: 0o700 });
  const singleManifestPath = path.join(caseRunRoot, "manifest.json");
  atomicWrite(singleManifestPath, singleManifest(item));
  const stdout = openSync(path.join(caseRunRoot, "sequencer.stdout.log"), "a", 0o600);
  const stderr = openSync(path.join(caseRunRoot, "sequencer.stderr.log"), "a", 0o600);
  const child = spawn(node, [sequencerPath], { cwd: sourceRoot, env: { ...process.env, APR_SOURCE_ROOT: sourceRoot, APR_MANIFEST_PATH: singleManifestPath, APR_RUN_ROOT: caseRunRoot, APR_CANONICAL_BUNDLES: bundlePath, APR_COHORT_OFFSET: "0", APR_PRESERVE_CONTINUITY: "0" }, stdio: ["ignore", stdout, stderr] });
  let spawnError = null;
  child.once("error", (error) => { spawnError = error; });
  const startedMs = Date.now();
  let lastProgressMs = startedMs;
  let fingerprint = materialFingerprint(item, caseRunRoot);
  let timeoutReason = null;
  while (child.exitCode === null && child.signalCode === null) {
    await sleep(pollMs);
    const next = materialFingerprint(item, caseRunRoot);
    if (next !== fingerprint) { fingerprint = next; lastProgressMs = Date.now(); persist("case_material_progress", { practiceId: item.practiceId, customerKey: item.customerKey, cohort: item.cohort, fingerprint }); }
    if (Date.now() - lastProgressMs >= noProgressMs) { timeoutReason = "no_material_progress_for_7_minutes"; break; }
    if (Date.now() - startedMs >= absoluteMs) { timeoutReason = "absolute_case_limit_25_minutes"; break; }
  }
  if (timeoutReason) {
    child.kill("SIGTERM");
    if (!(await waitForChildExit(child, 3000))) { child.kill("SIGKILL"); await waitForChildExit(child, 3000); }
  }
  closeSync(stdout); closeSync(stderr); quiesce(item);
  const fallback = timeoutReason ?? (spawnError ? `single_case_runner_spawn_error:${spawnError.message}` : `single_case_runner_exited_without_terminal_result:${child.exitCode ?? child.signalCode ?? "unknown"}`);
  const result = terminalResult(item, readJson(path.join(caseRunRoot, "report.json")), fallback);
  state.results.push(result); state.currentCustomerKey = null;
  persist("case_terminalized", { practiceId: item.practiceId, customerKey: item.customerKey, cohort: item.cohort, state: result.state, reason: result.reason ?? null, timeoutReason });
}
state.status = "completed"; state.endedAt = new Date().toISOString(); state.currentCustomerKey = null;
persist("lot_completed", { results: state.results.length });
