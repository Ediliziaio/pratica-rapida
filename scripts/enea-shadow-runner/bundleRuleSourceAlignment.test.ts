import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APR_RULE_SOURCE_FINGERPRINT } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { AUTO_CURRENT_VALIDATION_REVISION } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { assertAprBundleRuleSourceAlignment, resolveAprBundleRuleSourceAlignment, resolveAprGoverningValidationRevision } from "./bundleRuleSourceAlignment";
import { governingValidationRevision } from "./infissiExecutionGate";

const directories: string[] = [];
const bundle = (attestation?: unknown) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "apr-bundle-alignment-"));
  directories.push(directory);
  if (attestation !== undefined) writeFileSync(path.join(directory, "apr-rule-governance-attestation.json"), `${JSON.stringify(attestation)}\n`);
  return directory;
};

afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("il bundle installato comanda il registro applicato", () => {
  it("riconosce allineati bundle e sorgente che dichiarano lo stesso registro", () => {
    const result = resolveAprBundleRuleSourceAlignment(bundle({ ruleSourceFingerprint: APR_RULE_SOURCE_FINGERPRINT }));
    expect(result).toMatchObject({ aligned: true, bundleRuleFingerprint: APR_RULE_SOURCE_FINGERPRINT });
  });

  it("ferma il lotto quando il bundle applica un registro precedente al sorgente", () => {
    const stale = bundle({ ruleSourceFingerprint: "e4e8df74b56f53ea1223b007a4f0fc9ea86432db7a640a42bbb57d1d63af1345" });
    const result = resolveAprBundleRuleSourceAlignment(stale);
    expect(result.aligned).toBe(false);
    expect(result.reason).toContain("Ricostruire e installare il bundle");
    expect(() => assertAprBundleRuleSourceAlignment(stale)).toThrow(/apr_bundle_rule_source_divergence/);
  });

  it("resta fail-closed se il bundle non dichiara alcun registro", () => {
    expect(resolveAprBundleRuleSourceAlignment(bundle()).aligned).toBe(false);
    expect(resolveAprBundleRuleSourceAlignment(bundle({ version: "senza-fingerprint" })).aligned).toBe(false);
    expect(() => resolveAprGoverningValidationRevision(bundle())).toThrow(/apr_governing_bundle_rule_fingerprint_unavailable/);
  });

  it("il marcatore di convergenza deriva dal bundle, non dal registro del processo", () => {
    const governing = bundle({ ruleSourceFingerprint: "e4e8df74b56f53ea1223b007a4f0fc9ea86432db7a640a42bbb57d1d63af1345" });
    expect(resolveAprGoverningValidationRevision(governing)).toBe("auto-registry-e4e8df74b56f53ea1223b007a4f0fc9ea86432db7a640a42bbb57d1d63af1345");
    expect(governingValidationRevision(governing)).toBe(resolveAprGoverningValidationRevision(governing));
    expect(governingValidationRevision(governing)).not.toBe(AUTO_CURRENT_VALIDATION_REVISION);
  });

  it("senza bundle governante usa il registro del sorgente, perche' non esiste un secondo scrittore", () => {
    expect(governingValidationRevision("")).toBe(AUTO_CURRENT_VALIDATION_REVISION);
    expect(governingValidationRevision(undefined)).toBe(AUTO_CURRENT_VALIDATION_REVISION);
  });
});
