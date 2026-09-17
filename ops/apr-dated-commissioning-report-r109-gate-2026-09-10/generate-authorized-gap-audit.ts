import { createHash, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS } from "../../scripts/enea-shadow-runner/aprRuleGovernanceAdmission";
import { buildHistoricalBusinessDecisionAudit, inventoryHistoricalDecisionSources } from "../../scripts/enea-shadow-runner/historicalBusinessDecisionAudit";
import { PersistentRuleMatrixEvidence } from "../../scripts/enea-shadow-runner/ruleMatrixEvidence";

const repositoryRoot = process.cwd();
const gateRoot = path.join(repositoryRoot, "ops/apr-dated-commissioning-report-r109-gate-2026-09-10");
const evidenceRoot = path.join(gateRoot, "rule-evidence");
const baselineBundleDirectory = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/current";
const currentBundleDirectory = path.join(gateRoot, "staged-bundle");
const output = path.join(gateRoot, "historical-audit-report-r109.json");
const additionalSourceFiles = [path.join(repositoryRoot, "ops/apr-install-reseller-addressee-batch-r97-2026-09-08-2026-09-08/claude-sessions-export.json")];
const readBundle = (directory: string) => ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"].map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n");
const atomicWrite = (target: string, contents: string) => {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
};
const sameStrings = (left: readonly string[], right: readonly string[]) => left.length === right.length
  && [...left].sort().every((item, index) => item === [...right].sort()[index]);

const evidence = new PersistentRuleMatrixEvidence(evidenceRoot).snapshot();
if (evidence.testedCount !== APR_RULE_TEST_MATRIX.length) throw new Error("rule_evidence_incomplete");
const sourceInventory = await inventoryHistoricalDecisionSources({
  sessionsRoot: "/Users/giulianolavoro/.codex/sessions",
  additionalSourceFiles,
});
const report = buildHistoricalBusinessDecisionAudit({
  sourceInventory,
  provedMatrixKeys: new Set(evidence.rules.filter((item) => item.status !== "pending_test").map((item) => item.key)),
  deploymentVerified: true,
  baselineBundleText: readBundle(baselineBundleDirectory),
  currentBundleText: readBundle(currentBundleDirectory),
});
const unresolved = report.decisions.filter((item) => item.recoveryStatus === "unresolved_documented")
  .map((item) => item.decisionId.replace(/^decision:/u, ""));
if (report.status !== "incomplete"
  || report.unresolvedDocumentedDecisionCount !== APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS.length
  || !sameStrings(unresolved, APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS)) {
  throw new Error(`historical_gap_not_exactly_authorized:${JSON.stringify(unresolved)}`);
}
const body = `${JSON.stringify(report, null, 2)}\n`;
atomicWrite(output, body);
atomicWrite(`${output}.sha256`, `${createHash("sha256").update(body).digest("hex")}  ${path.basename(output)}\n`);
console.log(JSON.stringify({
  status: "authorized_historical_gap_only",
  declaredDecisionCount: report.declaredDecisionCount,
  alreadyActiveCount: report.alreadyActiveCount,
  newlyActivatedNowCount: report.newlyActivatedNowCount,
  supersededCount: report.supersededCount,
  unresolvedDocumentedDecisionCount: report.unresolvedDocumentedDecisionCount,
  unresolved,
  output,
}));
