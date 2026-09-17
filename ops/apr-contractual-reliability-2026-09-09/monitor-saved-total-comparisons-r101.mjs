#!/usr/bin/env node
import crypto from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const workspace = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const cohortsRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const targetedReport = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-contractual-reliability-r101-targeted-20260909/report.json";
const longReport = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-contractual-reliability-r101-long-20260909/report.json";
const outputPath = path.join(workspace, "ops/apr-contractual-reliability-2026-09-09/saved-total-comparison-r101.json");
const node = "/usr/local/bin/node";
const loader = path.join(workspace, "ops/apr-global-controller-test10-2026-08-29/apr-ts-loader.mjs");
const benchmarkCli = path.join(workspace, "ops/apr-wide100-province-lineage-2026-09-02/historical-benchmark-readonly-cli.ts");
const totalCli = path.join(workspace, "ops/apr-contractual-reliability-2026-09-09/saved-total-comparison-readonly-cli.ts");

function atomicWrite(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, filePath);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function cohortPath(item) {
  return path.join(cohortsRoot, `apr-pilot-${item.cohort}-global-controller-${item.customerKey}`);
}

function runCli(cli, root) {
  return spawnSync(node, ["--experimental-transform-types", "--experimental-loader", loader, cli, root], {
    cwd: workspace,
    encoding: "utf8",
    timeout: 120_000,
  });
}

const attempted = new Map();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function allSavedCases() {
  const reports = [targetedReport, longReport].filter(existsSync).map(readJson);
  return reports.flatMap((report) => (report.cases ?? [])
    .filter((item) => item.state === "saved")
    .map((item) => ({ ...item, runStatus: report.status })));
}

function refreshOne(item) {
  const root = cohortPath(item);
  const benchmarkPath = path.join(root, "historical-benchmark", "checkpoint.json");
  const totalPath = path.join(root, "historical-total-comparison", "checkpoint.json");
  if (!existsSync(benchmarkPath)) {
    const result = runCli(benchmarkCli, root);
    if (result.status !== 0) throw new Error(`benchmark_failed:${item.customerKey}:${(result.stderr || result.stdout).trim()}`);
  }
  const existing = existsSync(totalPath) ? readJson(totalPath) : null;
  if (!existing || existing.version !== "apr-saved-total-comparison-readonly-v3" || existing.status === "not_comparable") {
    const result = runCli(totalCli, root);
    if (result.status !== 0) throw new Error(`total_comparison_failed:${item.customerKey}:${(result.stderr || result.stdout).trim()}`);
  }
  return readJson(totalPath);
}

function writeAggregate(longStatus) {
  const savedCases = allSavedCases();
  const comparisons = [];
  for (const item of savedCases) {
    const totalPath = path.join(cohortPath(item), "historical-total-comparison", "checkpoint.json");
    if (existsSync(totalPath)) comparisons.push(readJson(totalPath));
  }
  const counts = {
    savedObserved: savedCases.length,
    compared: comparisons.length,
    concordant: comparisons.filter((item) => item.status === "concordant").length,
    discordant: comparisons.filter((item) => item.status === "discordant").length,
    notComparable: comparisons.filter((item) => item.status === "not_comparable").length,
  };
  atomicWrite(outputPath, {
    version: "apr-saved-total-comparison-aggregate-r101-v1",
    updatedAt: new Date().toISOString(),
    status: longStatus === "completed" && counts.savedObserved === counts.compared ? "completed" : "running",
    scope: "Tutte le pratiche SAVED del mirato e del lotto lungo r101",
    externalMutationAllowed: false,
    portalAccessed: false,
    historicalValuesMayFeedMapper: false,
    counts,
    discordant: comparisons.filter((item) => item.status === "discordant"),
    notComparable: comparisons.filter((item) => item.status === "not_comparable"),
    concordant: comparisons.filter((item) => item.status === "concordant"),
    attempts: Object.fromEntries(attempted),
  });
}

while (true) {
  const savedCases = allSavedCases();
  for (const item of savedCases) {
    if (attempted.get(item.practiceId)?.status === "completed"
      && attempted.get(item.practiceId)?.result !== "not_comparable") continue;
    try {
      const comparison = refreshOne(item);
      attempted.set(item.practiceId, { status: "completed", at: new Date().toISOString(), result: comparison.status });
      process.stdout.write(`${JSON.stringify({ type: "total_compared", name: item.displayName, status: comparison.status, deltaEuros: comparison.deltaEuros })}\n`);
    } catch (error) {
      attempted.set(item.practiceId, { status: "retry_pending", at: new Date().toISOString(), reason: error instanceof Error ? error.message : String(error) });
    }
    const longStatus = existsSync(longReport) ? readJson(longReport).status : "pending";
    writeAggregate(longStatus);
  }
  const longStatus = existsSync(longReport) ? readJson(longReport).status : "pending";
  writeAggregate(longStatus);
  if (longStatus === "completed") {
    const pending = allSavedCases().filter((item) => attempted.get(item.practiceId)?.status !== "completed");
    if (!pending.length) break;
  }
  await sleep(15_000);
}

process.stdout.write(`${JSON.stringify({ type: "total_comparison_monitor_completed", outputPath })}\n`);
