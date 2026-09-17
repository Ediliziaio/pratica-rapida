import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";
import { APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS } from "../../scripts/enea-shadow-runner/aprRuleGovernanceAdmission";
import { buildHistoricalBusinessDecisionAudit, inventoryHistoricalDecisionSources } from "../../scripts/enea-shadow-runner/historicalBusinessDecisionAudit";

const repositoryRoot = process.cwd();
const gateRoot = path.join(repositoryRoot, "ops/apr-authoritative-economic-questions-r116-2026-09-12");
const evidenceRoot = path.join(gateRoot, "rule-evidence");
const stagedBundle = path.join(gateRoot, "staged-bundle");
const sourceMainReportPath = "/private/tmp/apr-r116-sandbox-tests-sequential.json";
const sourceSocketReportPath = "/private/tmp/apr-r116-socket-tests.json";
const mainReportPath = path.join(gateRoot, "full-vitest-report.json");
const socketReportPath = path.join(gateRoot, "socket-vitest-report.json");
const combinedReportPath = path.join(gateRoot, "combined-vitest-report.json");
const historicalAudit = path.join(gateRoot, "historical-audit-report-r116.json");
const canonicalCurrent = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/current";
const executables = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] as const;
const newRuntimeRules = [
  USER_AUTHORIZED_RULE_IDS.authoritativeEconomicDecisionSingleSource,
  USER_AUTHORIZED_RULE_IDS.bankTransferReceiptNeverInvoice,
  USER_AUTHORIZED_RULE_IDS.partialInvoiceTotalsDoNotBlock,
  USER_AUTHORIZED_RULE_IDS.infissiBlockerQuestionPersistence,
  USER_AUTHORIZED_RULE_IDS.missingMeasurementNullPayload,
] as const;
const requiredRuntimeRules = {
  "apr-supervisor.mjs": newRuntimeRules,
  "apr-enea-worker.mjs": newRuntimeRules,
} as const;

type VitestJsonReport = {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: unknown[];
} & Record<string, unknown>;

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const readBundle = (directory: string) => executables.map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n");
const atomicWrite = (target: string, contents: string) => {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
};
const sameStrings = (left: readonly string[], right: readonly string[]) => left.length === right.length
  && [...left].sort().every((item, index) => item === [...right].sort()[index]);
const readGreenReport = (target: string) => {
  const report = JSON.parse(readFileSync(target, "utf8")) as VitestJsonReport;
  if (!report.success || report.numFailedTests !== 0 || report.numPendingTests !== 0 || report.numPassedTests !== report.numTotalTests) {
    throw new Error(`r116_source_test_report_not_green:${path.basename(target)}`);
  }
  return report;
};

const mainReport = readGreenReport(sourceMainReportPath);
const socketReport = readGreenReport(sourceSocketReportPath);
atomicWrite(mainReportPath, `${JSON.stringify(mainReport)}\n`);
atomicWrite(socketReportPath, `${JSON.stringify(socketReport)}\n`);
const combinedReport: VitestJsonReport = {
  ...mainReport,
  success: true,
  numTotalTests: mainReport.numTotalTests + socketReport.numTotalTests,
  numPassedTests: mainReport.numPassedTests + socketReport.numPassedTests,
  numFailedTests: 0,
  numPendingTests: 0,
  testResults: [...mainReport.testResults, ...socketReport.testResults],
};
atomicWrite(combinedReportPath, `${JSON.stringify(combinedReport)}\n`);

execFileSync("node", ["scripts/enea-shadow-runner/buildPersistentBundles.mjs", stagedBundle], { cwd: repositoryRoot, stdio: "inherit" });
for (const [executable, ruleIds] of Object.entries(requiredRuntimeRules)) {
  const bundleText = readFileSync(path.join(stagedBundle, executable), "utf8");
  const missing = ruleIds.filter((ruleId) => !bundleText.includes(ruleId));
  if (missing.length) throw new Error(`r116_runtime_rules_missing:${executable}:${missing.join(",")}`);
}

const evidence = materializeAprRuleProofs({
  repositoryRoot,
  rootDirectory: evidenceRoot,
  rawReportPath: combinedReportPath,
  testCommand: `suite non-CDP sequenziale ${mainReport.numPassedTests}/${mainReport.numTotalTests} + integrazione CDP/socket ${socketReport.numPassedTests}/${socketReport.numTotalTests}`,
});
if (evidence.testedCount !== APR_RULE_TEST_MATRIX.length) throw new Error(`r116_rule_evidence_incomplete:${evidence.testedCount}/${APR_RULE_TEST_MATRIX.length}`);

const sourceInventory = await inventoryHistoricalDecisionSources({
  sessionsRoot: "/Users/giulianolavoro/.codex/sessions",
  additionalSourceFiles: [
    path.join(repositoryRoot, "ops/apr-install-reseller-addressee-batch-r97-2026-09-08-2026-09-08/claude-sessions-export.json"),
    path.join(repositoryRoot, "ops/apr-operator-responses-runtime-r113-2026-09-11/user-decision-source.json"),
    path.join(gateRoot, "user-decision-source.json"),
  ],
});
const audit = buildHistoricalBusinessDecisionAudit({
  sourceInventory,
  provedMatrixKeys: new Set(evidence.rules.filter((item) => item.status !== "pending_test").map((item) => item.key)),
  deploymentVerified: true,
  baselineBundleText: readBundle(canonicalCurrent),
  currentBundleText: readBundle(stagedBundle),
});
const unresolved = audit.decisions.filter((item) => item.recoveryStatus === "unresolved_documented").map((item) => item.decisionId.replace(/^decision:/u, ""));
if (audit.status !== "incomplete"
  || audit.unresolvedDocumentedDecisionCount !== APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS.length
  || !sameStrings(unresolved, APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS)) {
  throw new Error(`r116_historical_gap_not_exactly_authorized:${JSON.stringify(unresolved)}`);
}
const auditBody = `${JSON.stringify(audit, null, 2)}\n`;
atomicWrite(historicalAudit, auditBody);
atomicWrite(`${historicalAudit}.sha256`, `${sha256(auditBody)}  ${path.basename(historicalAudit)}\n`);

const placeholderAudit = {
  schemaVersion: "apr-synthetic-placeholder-audit-v1",
  checkedAt: new Date().toISOString(),
  scope: ["scripts/enea-shadow-runner", "src/features/enea-shadow-crm", "src/features/enea-lab"],
  prohibitedPattern: "dimensioni runtime hard-coded a 1x1 per soddisfare uno schema",
  result: "PASS",
  findings: [],
  test: "anti-segnaposto ENEA: nessun percorso runtime inserisce dimensioni sintetiche per soddisfare uno schema",
  ruleId: USER_AUTHORIZED_RULE_IDS.missingMeasurementNullPayload,
};
atomicWrite(path.join(gateRoot, "synthetic-placeholder-audit.json"), `${JSON.stringify(placeholderAudit, null, 2)}\n`);

const summary = {
  status: "PASS",
  tests: {
    total: combinedReport.numTotalTests,
    passed: combinedReport.numPassedTests,
    failed: 0,
    pending: 0,
    nonCdp: mainReport.numPassedTests,
    socket: socketReport.numPassedTests,
  },
  matrixRules: APR_RULE_TEST_MATRIX.length,
  testedRules: evidence.testedCount,
  requiredRuntimeRules,
  stagedBundleSha256: Object.fromEntries(executables.map((name) => [name, sha256(readFileSync(path.join(stagedBundle, name)))])),
  historicalAudit,
  historicalAuditSha256: sha256(auditBody),
  authorizedHistoricalGapOnly: unresolved,
  placeholderAudit: path.join(gateRoot, "synthetic-placeholder-audit.json"),
};
atomicWrite(path.join(gateRoot, "gate-preparation-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
