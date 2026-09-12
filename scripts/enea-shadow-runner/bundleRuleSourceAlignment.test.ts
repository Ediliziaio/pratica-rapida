import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ENEA_OPERATIONAL_REGISTRY_CONTENT_HASH } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { resolveAprBundleRuleSourceAlignment } from "./bundleRuleSourceAlignment";

const directories: string[] = [];
const bundle = (attestation?: unknown) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "apr-bundle-alignment-"));
  directories.push(directory);
  if (attestation !== undefined) writeFileSync(path.join(directory, "apr-rule-governance-attestation.json"), `${JSON.stringify(attestation)}\n`);
  return directory;
};

afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("allineamento fra registro del bundle installato e registro del sorgente", () => {
  it("riconosce allineati bundle e sorgente che dichiarano lo stesso registro", () => {
    const result = resolveAprBundleRuleSourceAlignment(bundle({ ruleSourceFingerprint: ENEA_OPERATIONAL_REGISTRY_CONTENT_HASH }));
    expect(result).toMatchObject({ aligned: true, bundleRuleFingerprint: ENEA_OPERATIONAL_REGISTRY_CONTENT_HASH });
  });

  it("riconosce la divergenza che fa contendere il checkpoint a supervisore e sequencer", () => {
    const result = resolveAprBundleRuleSourceAlignment(bundle({ ruleSourceFingerprint: "e4e8df74b56f53ea1223b007a4f0fc9ea86432db7a640a42bbb57d1d63af1345" }));
    expect(result.aligned).toBe(false);
    expect(result.reason).toContain("si contenderebbero lo stesso checkpoint");
  });

  it("resta fail-closed se il bundle non dichiara alcun registro", () => {
    expect(resolveAprBundleRuleSourceAlignment(bundle()).aligned).toBe(false);
    expect(resolveAprBundleRuleSourceAlignment(bundle({ version: "senza-fingerprint" })).aligned).toBe(false);
  });
});
