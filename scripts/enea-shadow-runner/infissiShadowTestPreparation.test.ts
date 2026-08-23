import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APR_INFISSI_SHADOW_TEST_FIXTURE } from "./fixtures/infissiShadowTestFixture";
import { PersistentAprInfissiLocalMappingPreflight } from "./infissiLocalMappingPreflight";
import { PersistentAprInfissiShadowTestPreparation } from "./infissiShadowTestPreparation";

describe("preparazione persistente primo test Infissi shadow", () => {
  it("seleziona il caso TEST locale e produce checklist, expected values e criteri senza autorizzare azioni esterne", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-infissi-shadow-test-"));
    const mapping = new PersistentAprInfissiLocalMappingPreflight(root).run(structuredClone(APR_INFISSI_SHADOW_TEST_FIXTURE), new Date("2026-08-19T15:00:00Z"));
    const plan = new PersistentAprInfissiShadowTestPreparation(root).prepare(mapping, new Date("2026-08-19T15:01:00Z"));

    expect(plan).toMatchObject({
      status: "ready_for_external_authorization",
      selectedCase: { customerKey: "cristina-fabbro", displayName: "Cristina Fabbro", mode: "TEST" },
      expectedValues: {
        physicalWindowCount: 8,
        invoiceGrossTotal: 7600.02,
        oldWindowThermalTransmittanceWm2K: 3,
        frameMaterial: "PVC",
        glassType: "Triplo vetro basso emissivo",
        shadingClosuresChecked: false,
        energySavings: "portal_computed_leave_unset",
      },
      residualBlocker: null,
      externalInteractionAuthorized: false,
      browserAllowed: false,
      crmReadAllowed: false,
      eneaReadAllowed: false,
      eneaWriteAllowed: false,
      previewAllowed: false,
      submitAllowed: false,
      communicationsAllowed: false,
    });
    expect(plan.checklist.every((item) => item.status === "PASS")).toBe(true);
    expect(plan.passCriteria).toHaveLength(4);
    expect(plan.failCriteria).toHaveLength(4);
  });

  it("riparte dal checkpoint senza duplicare il piano shadow", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-infissi-shadow-restart-"));
    const mapping = new PersistentAprInfissiLocalMappingPreflight(root).run(structuredClone(APR_INFISSI_SHADOW_TEST_FIXTURE), new Date("2026-08-19T15:00:00Z"));
    const firstStore = new PersistentAprInfissiShadowTestPreparation(root);
    const first = firstStore.prepare(mapping, new Date("2026-08-19T15:01:00Z"));
    const before = readFileSync(firstStore.checkpointPath);
    const restarted = new PersistentAprInfissiShadowTestPreparation(root);
    const second = restarted.prepare(mapping, new Date("2026-08-19T15:10:00Z"));

    expect(second.revision).toBe(first.revision);
    expect(second.audit).toEqual(first.audit);
    expect(readFileSync(restarted.checkpointPath)).toEqual(before);
  });
});
