#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = process.cwd();
const outputRoot = "/tmp/apr-r122-isolated-tests";
const summaryPath = path.join(outputRoot, "summary.json");
mkdirSync(outputRoot, { recursive: true });

const tests = [];
const walk = (relativeDirectory) => {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  for (const entry of readdirSync(absoluteDirectory).sort()) {
    const relativePath = path.join(relativeDirectory, entry);
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (statSync(absolutePath).isDirectory()) {
      walk(relativePath);
    } else if (/\.test\.(?:ts|tsx)$/u.test(entry)) {
      tests.push(relativePath);
    }
  }
};
walk("scripts");
walk("src");

const previous = (() => {
  try { return JSON.parse(readFileSync(summaryPath, "utf8")); }
  catch { return { version: "apr-isolated-vitest-summary-v1", startedAt: new Date().toISOString(), results: [] }; }
})();
const resultsByFile = new Map(previous.results.map((item) => [item.file, item]));

const persist = () => {
  const results = tests.flatMap((file) => resultsByFile.get(file) ?? []);
  const body = `${JSON.stringify({
    version: "apr-isolated-vitest-summary-v1",
    startedAt: previous.startedAt,
    updatedAt: new Date().toISOString(),
    complete: results.length === tests.length,
    totalFiles: tests.length,
    completedFiles: results.length,
    passedFiles: results.filter((item) => item.status === "passed").length,
    failedFiles: results.filter((item) => item.status === "failed").length,
    timedOutFiles: results.filter((item) => item.status === "timed_out").length,
    totalTests: results.reduce((sum, item) => sum + item.totalTests, 0),
    passedTests: results.reduce((sum, item) => sum + item.passedTests, 0),
    failedTests: results.reduce((sum, item) => sum + item.failedTests, 0),
    results,
  }, null, 2)}\n`;
  const temporary = `${summaryPath}.tmp-${process.pid}`;
  writeFileSync(temporary, body, "utf8");
  renameSync(temporary, summaryPath);
};

for (const [index, file] of tests.entries()) {
  if (resultsByFile.has(file)) continue;
  const reportPath = path.join(outputRoot, `${String(index + 1).padStart(3, "0")}.json`);
  const startedAt = new Date().toISOString();
  const execution = spawnSync(
    "npx",
    ["vitest", "run", "--reporter=json", `--outputFile=${reportPath}`, file],
    { cwd: repositoryRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 20 * 1024 * 1024 },
  );
  let report = null;
  try { report = JSON.parse(readFileSync(reportPath, "utf8")); } catch {}
  const timedOut = execution.error?.code === "ETIMEDOUT";
  resultsByFile.set(file, {
    file,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: timedOut ? "timed_out" : execution.status === 0 && report?.success === true ? "passed" : "failed",
    exitCode: execution.status,
    signal: execution.signal,
    error: execution.error ? String(execution.error) : null,
    totalTests: report?.numTotalTests ?? 0,
    passedTests: report?.numPassedTests ?? 0,
    failedTests: report?.numFailedTests ?? 0,
    failedAssertions: (report?.testResults ?? []).flatMap((suite) =>
      (suite.assertionResults ?? []).filter((assertion) => assertion.status === "failed").map((assertion) => assertion.fullName),
    ),
  });
  persist();
  process.stdout.write(`${index + 1}/${tests.length} ${file} ${resultsByFile.get(file).status}\n`);
}

persist();
const final = JSON.parse(readFileSync(summaryPath, "utf8"));
process.stdout.write(`${JSON.stringify({
  complete: final.complete,
  totalFiles: final.totalFiles,
  passedFiles: final.passedFiles,
  failedFiles: final.failedFiles,
  timedOutFiles: final.timedOutFiles,
  totalTests: final.totalTests,
  passedTests: final.passedTests,
  failedTests: final.failedTests,
  summaryPath,
}, null, 2)}\n`);
if (!final.complete || final.failedFiles > 0 || final.timedOutFiles > 0) process.exitCode = 1;
