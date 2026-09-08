import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APR_GOVERNED_BUNDLE_FILES, installGovernedBundleSet } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerGovernedBundleSet.mjs";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });
const fixture = () => { const root = mkdtempSync(path.join(os.tmpdir(), "apr-governed-bundle-set-")); roots.push(root); const source = path.join(root, "source"); const install = path.join(root, "install"); mkdirSync(source); return { source, install }; };

describe("installazione del bundle governato nelle coorti APR", () => {
  it("copia eseguibili e attestazione come un unico insieme", () => {
    const value = fixture();
    for (const name of APR_GOVERNED_BUNDLE_FILES) writeFileSync(path.join(value.source, name), name);
    const result = installGovernedBundleSet(value.source, value.install);
    expect(result.files).toEqual(APR_GOVERNED_BUNDLE_FILES);
    for (const name of APR_GOVERNED_BUNDLE_FILES) expect(readFileSync(path.join(value.install, name), "utf8")).toBe(name);
  });

  it("fallisce chiuso prima di copiare se manca l'attestazione", () => {
    const value = fixture();
    for (const name of APR_GOVERNED_BUNDLE_FILES.filter((item: string) => !item.endsWith("attestation.json"))) writeFileSync(path.join(value.source, name), name);
    expect(() => installGovernedBundleSet(value.source, value.install)).toThrow("apr_governed_bundle_set_incomplete:apr-rule-governance-attestation.json");
  });
});
