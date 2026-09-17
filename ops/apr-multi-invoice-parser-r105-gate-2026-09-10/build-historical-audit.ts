import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import {
  buildHistoricalBusinessDecisionAudit,
  inventoryHistoricalDecisionSources,
} from "../../scripts/enea-shadow-runner/historicalBusinessDecisionAudit";
import { PersistentRuleMatrixEvidence } from "../../scripts/enea-shadow-runner/ruleMatrixEvidence";

const repositoryRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const baselineBundle = path.join(canonicalRoot, "versions/0b183b6e-preflight-deep-review-propagation-r104-20260910");
const evidenceRoot = path.join(repositoryRoot, "ops/apr-multi-invoice-parser-r105-gate-2026-09-10/rule-evidence");
const currentBundle = path.join(repositoryRoot, "ops/apr-multi-invoice-parser-r105-gate-2026-09-10/staged-bundle");
const output = path.join(repositoryRoot, "ops/apr-multi-invoice-parser-r105-gate-2026-09-10/historical-audit-report-r105.json");
const executables = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] as const;
const readBundle = (directory: string) => executables.map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const evidence = new PersistentRuleMatrixEvidence(evidenceRoot).snapshot();
const pendingRules = evidence.rules.filter((item) => item.status === "pending_test");
if (evidence.testedCount !== APR_RULE_TEST_MATRIX.length || pendingRules.length !== 0) {
  throw new Error(`rule_evidence_incomplete:${JSON.stringify({ tested: evidence.testedCount, pending: pendingRules.length, expected: APR_RULE_TEST_MATRIX.length })}`);
}

const sourceInventory = await inventoryHistoricalDecisionSources({
  sessionsRoot: "/Users/giulianolavoro/.codex/sessions",
  additionalSourceFiles: [
    path.join(repositoryRoot, "ops/apr-install-reseller-addressee-batch-r97-2026-09-08-2026-09-08/claude-sessions-export.json"),
  ],
});
const report = buildHistoricalBusinessDecisionAudit({
  sourceInventory,
  provedMatrixKeys: new Set(evidence.rules.filter((item) => item.status !== "pending_test").map((item) => item.key)),
  deploymentVerified: true,
  baselineBundleText: readBundle(baselineBundle),
  currentBundleText: readBundle(currentBundle),
});
const unresolved = report.decisions
  .filter((item) => item.recoveryStatus === "unresolved_documented")
  .map((item) => item.decisionId.replace(/^decision:/, ""))
  .sort();
const authorized = [
  "user-2026-08-06-existing-plant-authoritative-mapping-v1",
  "user-2026-08-06-intervention-authoritative-sources-and-defaults-v1",
  "user-2026-08-06-portal-intermediary-physical-beneficiary-v1",
  "user-2026-08-06-portal-municipality-controlled-selection-v1",
].sort();
if (
  report.status !== "incomplete"
  || report.unresolvedDocumentedDecisionCount !== authorized.length
  || JSON.stringify(unresolved) !== JSON.stringify(authorized)
) {
  throw new Error(`historical_audit_not_exactly_authorized_gap:${JSON.stringify({ status: report.status, unresolved })}`);
}
mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
process.stdout.write(`${JSON.stringify({
  status: report.status,
  matrixRules: APR_RULE_TEST_MATRIX.length,
  testedRules: evidence.testedCount,
  unresolved,
  output,
  sha256: sha256(readFileSync(output, "utf8")),
}, null, 2)}\n`);
