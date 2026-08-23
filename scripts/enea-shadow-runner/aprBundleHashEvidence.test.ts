import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeStagedBundleHashes, verifyStagedBundleHashEvidence } from "./aprBundleHashEvidence";

function staging(missing?: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-staged-bundles-")); mkdirSync(root, { recursive: true });
  for (const filename of ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"]) if (filename !== missing) writeFileSync(path.join(root, filename), `// ${filename}\n`);
  return root;
}

describe("APR staged bundle hash evidence", () => {
  it("calcola SHA-256 reali e mantiene vuoti i campi installati", () => {
    const evidence = computeStagedBundleHashes(staging());
    expect(evidence.map((item) => item.role)).toEqual(["supervisor", "worker", "watchdog"]);
    expect(evidence.every((item) => /^[a-f0-9]{64}$/.test(item.stagedSha256) && item.installedPath === null && item.installedSha256 === null)).toBe(true);
    expect(verifyStagedBundleHashEvidence(evidence)).toBe(true);
  });

  it("rifiuta un ruolo mancante nello staging", () => {
    expect(() => computeStagedBundleHashes(staging("apr-enea-worker.mjs"))).toThrow(/apr_staged_bundle_missing:worker/);
  });

  it("rifiuta un bundle modificato dopo il calcolo", () => {
    const root = staging(); const evidence = computeStagedBundleHashes(root);
    writeFileSync(path.join(root, "apr-watchdog.mjs"), "// altered\n");
    expect(() => verifyStagedBundleHashEvidence(evidence)).toThrow(/hash_mismatch:watchdog/);
  });
});
