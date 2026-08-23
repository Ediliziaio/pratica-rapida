import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PersistentAprEneaRealReadOnlyAttach, type AprEneaAttachDiagnostics } from "./aprEneaRealReadOnlyAttach";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-real-readonly-attach-"));
  const orchestrator = {
    snapshot: vi.fn(() => ({ gates: [{ gateId: "real_enea_readonly_attach", state: "waiting_safety_gate" }] })),
    recordReadOnlyAttachBlocked: vi.fn(() => undefined), recordReadOnlyAttachCompleted: vi.fn(() => undefined),
  };
  const discovery = { snapshot: vi.fn(() => ({ version: "apr-enea-readonly-discovery-v1", revision: 6, status: "completed_local_discovery", phase: "completed", planSha256: "a".repeat(64) })) };
  return { root, orchestrator, discovery };
}

const blockedDiagnostics: AprEneaAttachDiagnostics = {
  observedAt: "2026-08-17T15:00:00.000Z", browserFamily: "chrome", selectedProfile: "Default", chromeRunning: true,
  extensionInstalled: true, extensionEnabled: true, nativeHostCorrect: true, controllerConnected: false, retryCount: 1,
  newWindowCreated: false, newTabCreated: false, navigationPerformed: false, networkRequestPerformed: false,
  crmTabFound: null, eneaTabFound: null, crmDomVerified: null, eneaDomVerified: null, errorCode: "chrome_extension_transport_unavailable",
};

describe("PersistentAprEneaRealReadOnlyAttach", () => {
  it("registra il blocco globale del trasporto con quattro prove e resta idempotente al riavvio", () => {
    const { root, orchestrator, discovery } = fixture(); const now = new Date("2026-08-17T15:00:01.000Z");
    const controller = new PersistentAprEneaRealReadOnlyAttach(root, orchestrator as never, discovery as never);
    const blocked = controller.recordDiagnostics(blockedDiagnostics, now);
    expect(blocked).toMatchObject({ status: "technical_block", phase: "transport_checked", externalActionAllowed: false, createWindowAllowed: false, createTabsAllowed: false, navigationAllowed: false, networkRequestAllowed: false });
    expect(controller.snapshot(now)).toMatchObject({ status: "technical_block", transportChecksPassed: 4, diagnostics: { controllerConnected: false, retryCount: 1 } });
    expect(orchestrator.recordReadOnlyAttachBlocked).toHaveBeenCalledOnce();
    const before = readFileSync(controller.checkpointPath); const restarted = new PersistentAprEneaRealReadOnlyAttach(root, orchestrator as never, discovery as never);
    const replay = restarted.recordDiagnostics(blockedDiagnostics, new Date(now.getTime() + 10_000));
    expect(replay.revision).toBe(blocked.revision); expect(sha256(readFileSync(controller.checkpointPath))).toBe(sha256(before));
    expect(orchestrator.recordReadOnlyAttachBlocked).toHaveBeenCalledOnce();
  });

  it("completa solo con entrambe le schede e i DOM osservati senza azioni", () => {
    const { root, orchestrator, discovery } = fixture(); const controller = new PersistentAprEneaRealReadOnlyAttach(root, orchestrator as never, discovery as never);
    const completed = controller.recordDiagnostics({ ...blockedDiagnostics, controllerConnected: true, crmTabFound: true, eneaTabFound: true, crmDomVerified: true, eneaDomVerified: true, errorCode: null }, new Date("2026-08-17T15:00:01.000Z"));
    expect(completed).toMatchObject({ status: "completed_readonly_attach", phase: "completed", externalActionAllowed: false, navigationAllowed: false, networkRequestAllowed: false });
    expect(orchestrator.recordReadOnlyAttachCompleted).toHaveBeenCalledOnce();
  });

  it("sostituisce il blocco trasporto con il blocco schede mancanti dopo il riaggancio riuscito", () => {
    const { root, orchestrator, discovery } = fixture(); const controller = new PersistentAprEneaRealReadOnlyAttach(root, orchestrator as never, discovery as never);
    controller.recordDiagnostics(blockedDiagnostics, new Date("2026-08-17T15:00:01.000Z"));
    const blocked = controller.recordDiagnostics({ ...blockedDiagnostics, observedAt: "2026-08-17T15:01:00.000Z", controllerConnected: true, newWindowCreated: true,
      crmTabFound: false, eneaTabFound: false, crmDomVerified: false, eneaDomVerified: false, errorCode: "required_tabs_not_visible" }, new Date("2026-08-17T15:01:00.000Z"));
    expect(blocked).toMatchObject({ status: "technical_block", revision: 2, diagnostics: { controllerConnected: true, newWindowCreated: true, errorCode: "required_tabs_not_visible" } });
    expect(blocked.reason).toContain("about:blank");
    expect(orchestrator.recordReadOnlyAttachBlocked).toHaveBeenCalledTimes(2);
  });

  it("registra la caduta del canale dopo un attach riuscito senza confonderla con logout", () => {
    const { root, orchestrator, discovery } = fixture(); const controller = new PersistentAprEneaRealReadOnlyAttach(root, orchestrator as never, discovery as never);
    const blocked = controller.recordDiagnostics({ ...blockedDiagnostics, observedAt: "2026-08-17T15:02:00.000Z", newWindowCreated: true,
      errorCode: "chrome_extension_transport_unstable_after_attach" }, new Date("2026-08-17T15:02:00.000Z"));
    expect(blocked).toMatchObject({ status: "technical_block", diagnostics: { controllerConnected: false, errorCode: "chrome_extension_transport_unstable_after_attach" } });
    expect(blocked.reason).toContain("canale dell'estensione è caduto");
    expect(blocked.nextAction).toContain("Reinstallare il plugin Browser");
  });

  it("rifiuta un falso successo senza DOM ENEA", () => {
    const { root, orchestrator, discovery } = fixture(); const controller = new PersistentAprEneaRealReadOnlyAttach(root, orchestrator as never, discovery as never);
    expect(() => controller.recordDiagnostics({ ...blockedDiagnostics, controllerConnected: true, crmTabFound: true, eneaTabFound: true, crmDomVerified: true, eneaDomVerified: false, errorCode: null })).toThrow("enea_real_readonly_attach_observation_incomplete");
  });
});
