import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const current = path.join(canonicalRoot, "current");
const r38 = path.join(canonicalRoot, "versions/a7f4c2d1-product-evidence-r38-20260903");
const r36 = path.join(canonicalRoot, "versions/de26daa2-producer-position-r36-20260903");
const currentTarget = existsSync(current) && lstatSync(current).isSymbolicLink() ? path.resolve(canonicalRoot, readlinkSync(current)) : null;
if (currentTarget !== r38 && currentTarget !== r36) throw new Error(`apr_r38_quarantine_unexpected_current:${currentTarget}`);
if (currentTarget === r38) {
  const temporary = path.join(canonicalRoot, `.current-r38-quarantine-${randomUUID()}`);
  symlinkSync(path.relative(canonicalRoot, r36), temporary);
  renameSync(temporary, current);
}
const finalTarget = path.resolve(canonicalRoot, readlinkSync(current));
if (finalTarget !== r36) throw new Error(`apr_r38_quarantine_failed:${finalTarget}`);
const artifact = {
  version: "apr-r38-quarantine-rollback-r36-v1",
  recordedAt: new Date().toISOString(),
  status: "r38_quarantined_r36_restored",
  previousTarget: currentTarget,
  restoredTarget: finalTarget,
  exactCause: "Blind review of original documents proved that the r37 single-product declaration can accept product evidence from an unbound reseller/manufacturer job even when the customer's invoices cite different quotations and a different product. This invalidates the claimed monotonicity of r37/r38 until a general source-binding gate is designed and authorized.",
  affectedFixture: "gemma-minore",
  keepaliveRestartRequested: false,
  chromeRestartRequested: false,
  eneaActionPerformed: false,
};
const target = "ops/apr-reliability-gap-audit-2026-09-03/quarantine-r38-rollback-r36.json";
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, ...artifact }, null, 2)}\n`);
