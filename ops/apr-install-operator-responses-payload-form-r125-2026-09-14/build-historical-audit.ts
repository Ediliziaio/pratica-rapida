import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS } from "../../scripts/enea-shadow-runner/aprRuleGovernanceAdmission";
import { buildHistoricalBusinessDecisionAudit, inventoryHistoricalDecisionSources } from "../../scripts/enea-shadow-runner/historicalBusinessDecisionAudit";

const repositoryRoot = process.cwd();
const root = path.join(repositoryRoot, "ops/apr-install-operator-responses-payload-form-r125-2026-09-14");
const baselineBundle = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/9720ac8c-certificate-measures-columnar-total-r123-20260913";
const currentBundle = path.join(root, "staged-bundle");
const output = path.join(root, "historical-audit-report-r125.json");
const executables = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] as const;
const readBundle = (directory: string) => executables.map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const sourceInventory = await inventoryHistoricalDecisionSources({
  sessionsRoot: "/Users/giulianolavoro/.codex/sessions",
  additionalSourceFiles: [
    path.join(repositoryRoot, "ops/apr-install-reseller-addressee-batch-r97-2026-09-08-2026-09-08/claude-sessions-export.json"),
    path.join(repositoryRoot, "ops/apr-operator-responses-runtime-r113-2026-09-11/user-decision-source.json"),
    path.join(repositoryRoot, "ops/apr-authoritative-economic-questions-r116-2026-09-12/user-decision-source.json"),
  ],
});
const report = buildHistoricalBusinessDecisionAudit({
  sourceInventory,
  provedMatrixKeys: new Set(APR_RULE_TEST_MATRIX.map((item) => item.key)),
  deploymentVerified: true,
  baselineBundleText: readBundle(baselineBundle),
  currentBundleText: readBundle(currentBundle),
});
const unresolved = report.decisions
  .filter((item) => item.recoveryStatus === "unresolved_documented")
  .map((item) => item.decisionId.replace(/^decision:/u, ""))
  .sort();
const authorized = [...APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS].sort();
if (report.status !== "incomplete"
  || report.unresolvedDocumentedDecisionCount !== authorized.length
  || JSON.stringify(unresolved) !== JSON.stringify(authorized)) {
  throw new Error(`historical_audit_not_exactly_authorized_gap:${JSON.stringify({ status: report.status, unresolved })}`);
}
mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
process.stdout.write(`${JSON.stringify({
  status: report.status,
  matrixRules: APR_RULE_TEST_MATRIX.length,
  unresolved,
  output,
  sha256: sha256(readFileSync(output, "utf8")),
}, null, 2)}\n`);
