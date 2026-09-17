import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/simple-independent-runner.mjs"), "utf8");

describe("runner canonico con rilavorazione persistente dei guasti APR", () => {
  it("consulta la policy canonica soltanto per una disposizione guasto_apr", () => {
    expect(source).toContain('const faultRecoveryCliPath = path.join(sourceRoot, "scripts/enea-shadow-runner/apr-fault-recovery-cli.ts");');
    expect(source).toContain('if (disposition?.kind === "guasto_apr")');
    expect(source).toContain('const decision = scheduleFaultRecovery(item, disposition);');
  });

  it("persiste tentativi, azione e coorte nel ledger prima della rilavorazione", () => {
    expect(source).toContain('version: "apr-fault-recovery-ledger-v1"');
    expect(source).toContain('entry.attemptsScheduled += 1;');
    expect(source).toContain('entry.recoveryCohort = faultRecoveryLedger.nextCohort++;');
    expect(source).toContain('writeFaultRecoveryLedger("fault_recovery_scheduled"');
    const scheduled = source.indexOf('writeFaultRecoveryLedger("fault_recovery_scheduled"');
    const started = source.indexOf('markFaultRecoveryStarted(recoveryEntry)');
    expect(started).toBeGreaterThan(scheduled);
  });

  it("ripristina un tentativo interrotto senza consumarne un altro", () => {
    expect(source).toContain('if (entry.status === "running" && entry.pendingAction) entry.status = "scheduled";');
    expect(source).toContain('atomicWrite(faultRecoveryLedgerPath, faultRecoveryLedger);');
  });

  it("esegue la seconda passata soltanto dopo il ciclo primario del manifest", () => {
    const primary = source.indexOf("for (const item of manifest.cases)");
    const endPass = source.indexOf('pendingFaultRecovery("rilavora_subito") ?? pendingFaultRecovery("rilavora_a_fine_lotto")');
    expect(primary).toBeGreaterThan(0);
    expect(endPass).toBeGreaterThan(primary);
  });

  it("sostituisce il verdetto della pratica invece di contarla due volte", () => {
    expect(source).toContain("function upsertResult(result)");
    expect(source).toContain("state.results[index] = result;");
    expect(source).not.toContain("state.results.push(result);\n  state.currentCustomerKey = null;");
  });
});
