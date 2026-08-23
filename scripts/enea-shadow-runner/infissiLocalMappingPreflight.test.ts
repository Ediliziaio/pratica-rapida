import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PersistentAprInfissiLocalMappingPreflight } from "./infissiLocalMappingPreflight";
import { APR_INFISSI_SHADOW_TEST_FIXTURE } from "./fixtures/infissiShadowTestFixture";

const fixture = () => structuredClone(APR_INFISSI_SHADOW_TEST_FIXTURE);

describe("checkpoint persistente APR · mapping locale Infissi", () => {
  it("persiste READY e tutte le barriere esterne chiuse", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-infissi-mapping-"));
    const state = new PersistentAprInfissiLocalMappingPreflight(root).run(fixture(), new Date("2026-08-19T10:00:00Z"));
    expect(state).toMatchObject({ status: "ready_for_portal_mapping", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
    expect(state.item).toMatchObject({ caseTruth: "READY", report: { outcome: "ready_local_plan", blockers: [], physicalProductCount: 8, invoiceGrossTotal: 7600.02 } });
    expect(state.item?.report.productRules.oldWindowThermalTransmittanceWm2K).toBe(3);
    expect(state.dryRun).toMatchObject({
      status: "completed",
      energySavingsWriteAllowed: false,
      portalManagedEnergySavings: true,
      technicalPreview: { physicalWindowCount: 8, expenseGrossVatIncluded: 7600.02 },
      checkpoints: [
        { phase: "source_validation", status: "completed" },
        { phase: "rule_resolution", status: "completed" },
        { phase: "payload_generation", status: "completed" },
        { phase: "external_gate_closed", status: "completed" },
      ],
    });
    expect(state.dryRun?.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(state.dryRun?.technicalPreview)).not.toContain("energySavingsKwhYear");
    expect(state.audit.at(-1)?.appliedRuleIds.length).toBeGreaterThan(5);
  });

  it("dopo riavvio non duplica il checkpoint e conserva byte e revisione", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-infissi-mapping-restart-"));
    const firstStore = new PersistentAprInfissiLocalMappingPreflight(root);
    const first = firstStore.run(fixture(), new Date("2026-08-19T10:00:00Z"));
    const before = readFileSync(firstStore.checkpointPath);
    const restarted = new PersistentAprInfissiLocalMappingPreflight(root);
    const second = restarted.run(fixture(), new Date("2026-08-19T10:05:00Z"));
    const after = readFileSync(restarted.checkpointPath);
    expect(second.revision).toBe(first.revision);
    expect(second.audit).toEqual(first.audit);
    expect(after).toEqual(before);
  });

  it("ignora un file temporaneo da crash e riprende dal checkpoint atomico senza rigenerare il payload", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-infissi-mapping-crash-"));
    const store = new PersistentAprInfissiLocalMappingPreflight(root);
    const first = store.run(fixture(), new Date("2026-08-19T10:00:00Z"));
    const before = readFileSync(store.checkpointPath);
    const orphan = `${store.checkpointPath}.tmp-crash`;
    writeFileSync(orphan, "{incomplete", "utf8");

    const resumed = new PersistentAprInfissiLocalMappingPreflight(root).run(fixture(), new Date("2026-08-19T10:10:00Z"));

    expect(resumed.revision).toBe(first.revision);
    expect(resumed.dryRun?.payloadSha256).toBe(first.dryRun?.payloadSha256);
    expect(readFileSync(store.checkpointPath)).toEqual(before);
  });
});
