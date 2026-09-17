import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/simple-independent-runner.mjs"), "utf8");

describe("chiusura canonica lotto senza pratiche mute", () => {
  it("esegue la classificazione delle fermate prima di pubblicare completed", () => {
    const invocation = source.lastIndexOf("const stopDisposition = runStopDispositionClosureAssessment();");
    const completion = source.lastIndexOf('state.status = "completed";');
    expect(invocation).toBeGreaterThan(0);
    expect(completion).toBeGreaterThan(invocation);
  });

  it("persiste il rapporto dedicato e lo include nel report finale", () => {
    expect(source).toContain('atomicWrite(path.join(runRoot, "stop-disposition-report.json"), stopDisposition);');
    expect(source).toContain('stopDisposition: state.stopDisposition ?? { status: "pending_until_lot_closure" }');
  });

  it("mostra separatamente domande operatore e guasti APR con i clienti", () => {
    expect(source).toContain("Domande scritte all'operatore:");
    expect(source).toContain("Guasti di APR da chiudere:");
    expect(source).toContain("item.displayName ?? item.customerKey");
    expect(source).toContain("item.text");
  });
});
