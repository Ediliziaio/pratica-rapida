import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PersistentAprLearningReplay } from "./aprLearningReplay";

const write = (root: string, file: string, value: unknown) => { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value)); return target; };

describe("APR fresh learning replay", () => {
  it("rifiuta un target che contiene risultati preflight precedenti", async () => {
    const source = mkdtempSync(path.join(tmpdir(), "apr-replay-source-")); const target = mkdtempSync(path.join(tmpdir(), "apr-replay-target-"));
    write(target, "crm-local-preflight/checkpoint.json", {});
    await expect(new PersistentAprLearningReplay(source, target).run()).rejects.toThrow("apr_learning_replay_target_not_fresh");
  });
  it("non importa checkpoint di analisi dal corpus sorgente", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/aprLearningReplay.ts"), "utf8");
    expect(source).not.toContain('copyFileSync(path.join(this.sourceRoot, "crm-document-analysis"');
    expect(source).toContain("analyzePdfLocally(file, ocrExecutable)");
  });
  it("conserva nel checkpoint routing dichiarato, documentale, evidenze e regola applicata", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/aprLearningReplay.ts"), "utf8");
    expect(source).toContain("declaredProductModule: declaredModule");
    expect(source).toContain("routingEvidence: { screening: routing.screeningEvidence, infissi: routing.infissiEvidence }");
    expect(source).toContain("appliedRuleIds: routing.appliedRuleIds");
    expect(source).toContain('productModule === "mixed" ? [commonSource, infissiSource]');
  });
});
