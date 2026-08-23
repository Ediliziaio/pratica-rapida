import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("export pacchetto bozza APR", () => {
  it("mantiene l'export in un percorso privato deterministico e non abilita preview/submit", () => {
    const source = readFileSync(path.resolve("scripts/enea-shadow-runner/draft-package-export-cli.ts"), "utf8");
    expect(source).toContain('path.join(rootDirectory, "enea-draft-execution", "packages")');
    expect(source).toContain('`${customerKey}-${draftPackage.packageFingerprint}.json`');
    expect(source).toContain("draft_package_output_not_allowlisted");
    expect(source).toContain("draft_package_immutable_conflict");
    expect(source).toContain("0o600");
    expect(source).not.toMatch(/previewAllowed\s*:\s*true|submitAllowed\s*:\s*true/);
  });
});
