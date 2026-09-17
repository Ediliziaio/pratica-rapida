import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/simple-independent-runner.mjs"), "utf8");

describe("chiusura canonica lotto con cricchetto di non regressione", () => {
  it("esegue il CLI read-only prima di pubblicare lo stato completed", () => {
    const invocation = source.lastIndexOf("const regressionGuard = runRegressionClosureAssessment();");
    const completion = source.lastIndexOf('state.status = "completed";');
    expect(invocation).toBeGreaterThan(0);
    expect(completion).toBeGreaterThan(invocation);
  });

  it("persiste il risultato dedicato e lo include nel report finale", () => {
    expect(source).toContain('atomicWrite(path.join(runRoot, "regression-report.json"), regressionGuard);');
    expect(source).toContain('regressionGuard: state.regressionGuard ?? { status: "pending_until_lot_closure" }');
    expect(source).toContain("Regressioni certificate:");
    expect(source).toContain("Giudizi senza fascicolo:");
  });

  it("usa il CLI locale senza accesso di rete o mutazioni sui checkpoint", () => {
    expect(source).toContain('node_modules/.bin/vite-node');
    expect(source).toContain('scripts/enea-shadow-runner/apr-case-regression-cli.ts');
    expect(source).toContain('APR_REGRESSION_RUNTIME_ROOT: runtimeRoot');
  });
});
