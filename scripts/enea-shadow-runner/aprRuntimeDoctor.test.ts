import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { PersistentEneaRunner } from "./runner";
import { PersistentAprCrmReadOnlyAdapter } from "./crmReadOnlyAdapter";
import { VERIFIED_APR_CRM_READONLY_FIXTURE } from "./fixtures/aprCrmReadOnlyFixture";
import { PersistentReadinessLease } from "./readinessLease";
import { PersistentReadOnlyAdapter } from "./readOnlyAdapter";
import { writeLocalDashboard } from "./dashboard";
import { inspectAprLocalRuntime } from "./aprRuntimeDoctor";

describe("doctor avvio APR locale", () => {
  it("dichiara pronto solo il dashboard locale mantenendo ogni gate esterno chiuso", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-doctor-"));
    try {
      const runner = new PersistentEneaRunner(directory); const state = runner.initialize([]);
      const readiness = new PersistentReadinessLease(directory); readiness.initialize();
      const generic = new PersistentReadOnlyAdapter(directory); generic.initialize();
      const crm = new PersistentAprCrmReadOnlyAdapter(directory); crm.configureFromFile(path.resolve("config/apr/crm-readonly-adapter.json")); crm.verifyFixture(VERIFIED_APR_CRM_READONLY_FIXTURE);
      writeLocalDashboard(directory, state, new Date(), null, readiness.snapshot(), generic.snapshot(), null, null, null, null, crm.snapshot());
      const report = inspectAprLocalRuntime(directory);
      expect(report).toMatchObject({ readyForLocalDashboard: true, realIntegrationAvailable: false, externalActionAllowed: false, operationalGate: "blocked_adapters_unverified" });
      expect(report.checks.every((check) => check.ok)).toBe(true);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("mantiene osservabile un runtime persistente anche se non usa la fixture CRM locale", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-doctor-operational-"));
    try {
      const runner = new PersistentEneaRunner(directory); const state = runner.initialize([]);
      new PersistentReadinessLease(directory).initialize();
      new PersistentReadOnlyAdapter(directory).initialize();
      writeLocalDashboard(directory, state, new Date());
      const report = inspectAprLocalRuntime(directory);
      expect(report.readyForDashboard).toBe(true);
      expect(report.readyForLocalDashboard).toBe(false);
      expect(report.checks.find((check) => check.id === "crm_config_local")?.ok).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
