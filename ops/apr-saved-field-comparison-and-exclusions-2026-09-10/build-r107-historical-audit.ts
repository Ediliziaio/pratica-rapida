import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { buildHistoricalBusinessDecisionAudit, inventoryHistoricalDecisionSources } from "../../scripts/enea-shadow-runner/historicalBusinessDecisionAudit";
import { PersistentRuleMatrixEvidence } from "../../scripts/enea-shadow-runner/ruleMatrixEvidence";

const repositoryRoot = path.resolve(".");
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const gateRoot = path.resolve("ops/apr-ideal-sistem-exclusion-r107-gate-2026-09-10");
const evidenceRoot = path.join(gateRoot, "rule-evidence");
const baselineBundle = path.join(canonicalRoot, "versions/742f23d6-infissi-explicit-no-screen-r106-20260910");
const currentBundle = path.join(gateRoot, "staged-bundle");
const output = path.join(gateRoot, "historical-audit-report-r107.json");
const executables = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] as const;
const readBundle = (directory: string) => executables.map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const evidence = new PersistentRuleMatrixEvidence(evidenceRoot).snapshot();
if (evidence.testedCount !== APR_RULE_TEST_MATRIX.length || evidence.rules.some((item) => item.status === "pending_test")) throw new Error("r107_rule_evidence_not_complete");
const sourceInventory = await inventoryHistoricalDecisionSources({
  sessionsRoot: "/Users/giulianolavoro/.codex/sessions",
  additionalSourceFiles: [path.join(repositoryRoot, "ops/apr-install-reseller-addressee-batch-r97-2026-09-08-2026-09-08/claude-sessions-export.json")],
});
const report = buildHistoricalBusinessDecisionAudit({
  sourceInventory,
  provedMatrixKeys: new Set(evidence.rules.filter((item) => item.status !== "pending_test").map((item) => item.key)),
  deploymentVerified: true,
  baselineBundleText: readBundle(baselineBundle),
  currentBundleText: readBundle(currentBundle),
});
const unresolved = report.decisions.filter((item) => item.recoveryStatus === "unresolved_documented").map((item) => item.decisionId.replace(/^decision:/, "")).sort();
const authorized = [
  "user-2026-08-06-existing-plant-authoritative-mapping-v1",
  "user-2026-08-06-intervention-authoritative-sources-and-defaults-v1",
  "user-2026-08-06-portal-intermediary-physical-beneficiary-v1",
  "user-2026-08-06-portal-municipality-controlled-selection-v1",
].sort();
if (report.status !== "incomplete" || JSON.stringify(unresolved) !== JSON.stringify(authorized)) throw new Error(`r107_historical_gap_not_exactly_authorized:${JSON.stringify(unresolved)}`);
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ status: report.status, matrixRules: APR_RULE_TEST_MATRIX.length, declaredDecisionCount: report.declaredDecisionCount, newlyActivatedNow: report.decisions.filter((item) => item.recoveryStatus === "newly_activated_now").map((item) => item.decisionId), unresolved, output, sha256: sha256(readFileSync(output)) }, null, 2)}\n`);
