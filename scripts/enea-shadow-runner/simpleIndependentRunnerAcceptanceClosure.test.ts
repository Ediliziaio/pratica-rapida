import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/simple-independent-runner.mjs"), "utf8");

describe("chiusura canonica lotto con standard di accettazione", () => {
  it("calcola il riepilogo prima di pubblicare lo stato completed", () => {
    const invocation = source.lastIndexOf("const acceptanceSummary = runAcceptanceClosureSummary();");
    const completion = source.lastIndexOf('state.status = "completed";');
    expect(invocation).toBeGreaterThan(0);
    expect(completion).toBeGreaterThan(invocation);
  });

  it("persiste il riepilogo dedicato e lo include nel report finale", () => {
    expect(source).toContain('atomicWrite(path.join(runRoot, "acceptance-report.json"), acceptanceSummary);');
    expect(source).toContain('acceptanceSummary: state.acceptanceSummary ?? { status: "pending_until_lot_closure" }');
  });

  it("apre il report Markdown con le quattro metriche del titolare", () => {
    const title = source.indexOf('`# ${reportTitle}`');
    const saved = source.indexOf('`Salvate: ${acceptance ? acceptance.salvate');
    const withQuestion = source.indexOf('`Con domanda: ${acceptance ? acceptance.conDomanda');
    const nonCompliant = source.indexOf('`Non conformi: ${acceptance ? acceptance.nonConformi');
    const withdrawn = source.indexOf('`Ritirate: ${acceptance ? acceptance.ritirate');
    const updated = source.indexOf('`Aggiornato: ${report.updatedAt}`');
    expect(title).toBeGreaterThan(0);
    expect(saved).toBeGreaterThan(title);
    expect(withQuestion).toBeGreaterThan(saved);
    expect(nonCompliant).toBeGreaterThan(withQuestion);
    expect(withdrawn).toBeGreaterThan(nonCompliant);
    expect(updated).toBeGreaterThan(withdrawn);
  });
});
