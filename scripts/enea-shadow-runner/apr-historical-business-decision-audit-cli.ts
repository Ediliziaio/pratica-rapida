#!/usr/bin/env node
import crypto from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { PersistentRuleMatrixEvidence } from "./ruleMatrixEvidence";
import { assertHistoricalBusinessDecisionAudit, buildHistoricalBusinessDecisionAudit, inventoryHistoricalDecisionSources } from "./historicalBusinessDecisionAudit";

const args = process.argv.slice(2);
const required = (name: string) => { const index = args.indexOf(name); const value = index >= 0 ? args[index + 1] : undefined; if (!value) throw new Error(`Opzione obbligatoria ${name}.`); return path.resolve(value); };
const readBundle = (directory: string) => ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"].map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n");
const atomicWrite = (target: string, contents: string) => {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
};

const sessionsRoot = required("--sessions-root");
const additionalSourceFiles = args.flatMap((value, index) => value === "--additional-source" && args[index + 1] ? [path.resolve(args[index + 1])] : []);
const evidenceRoot = required("--evidence-root");
const baselineBundleDirectory = required("--baseline-bundle-dir");
const currentBundleDirectory = required("--current-bundle-dir");
const output = required("--output");
const evidence = new PersistentRuleMatrixEvidence(evidenceRoot).snapshot();
const sourceInventory = await inventoryHistoricalDecisionSources({ sessionsRoot, additionalSourceFiles });
const report = buildHistoricalBusinessDecisionAudit({
  sourceInventory,
  provedMatrixKeys: new Set(evidence.rules.filter((item) => item.status !== "pending_test").map((item) => item.key)),
  deploymentVerified: evidence.testedCount === APR_RULE_TEST_MATRIX.length,
  baselineBundleText: readBundle(baselineBundleDirectory),
  currentBundleText: readBundle(currentBundleDirectory),
});
assertHistoricalBusinessDecisionAudit(report);
atomicWrite(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: report.status, declaredDecisionCount: report.declaredDecisionCount, alreadyActiveCount: report.alreadyActiveCount, newlyActivatedNowCount: report.newlyActivatedNowCount, supersededCount: report.supersededCount, unresolvedDocumentedDecisionCount: report.unresolvedDocumentedDecisionCount, sourceCoverage: { eligibleSessionFiles: report.sourceCoverage.eligibleSessionFiles, uniqueDirectUserMessages: report.sourceCoverage.uniqueDirectUserMessages, availableFrom: report.sourceCoverage.availableFrom, availableTo: report.sourceCoverage.availableTo, sourceCorpusFingerprint: report.sourceCoverage.sourceCorpusFingerprint }, output }, null, 2)}\n`);
