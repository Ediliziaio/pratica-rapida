import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentAprEneaDraftExecution } from "./eneaDraftExecution";
import {
  AprSimulatedProcessCrash,
  PersistentAprEneaBrowserWorker,
  PersistentSimulatedEneaPortalDriver,
  type AprEneaBrowserDriver,
  type AprEneaDraftPackage,
} from "./aprEneaBrowserWorker";

const directories: string[] = [];
function temporaryDirectory() { const directory = mkdtempSync(path.join(os.tmpdir(), "apr-autonomous-browser-worker-")); directories.push(directory); return directory; }
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function preflightFixture(keys = ["case-one", "case-two"]) {
  return {
    status: "completed",
    sourceFingerprint: "autonomous-two-case-source",
    items: keys.map((customerKey, index) => ({
      customerKey,
      displayName: `Case ${index + 1}`,
      practiceId: `crm-${index + 1}`,
      state: "ready_local_plan",
      report: { eneaPayloadAudit: { draftReady: true, mappingFingerprint: `mapping-${customerKey}`, requiredPortalFieldCount: 4, portalGate: { status: "ready", workflowFingerprint: `workflow-${customerKey}`, supportedPages: ["Beneficiario"], screeningItemCount: 1 } } },
    })),
  } as never;
}

function draftPackage(customerKey: string): AprEneaDraftPackage {
  const runtime = { pageName: "Beneficiario", markerIds: ["id-cf"], successMessage: "ok", fields: [{ portalId: "id-cf", control: "input" as const, value: "RSSMRA80A01H501U" }] };
  const calculation = { id: "calculation", pageName: "Calcolo costi e detrazioni", markerIds: ["id-risparmio"], successMessage: "ok", fields: [{ portalId: "id-risparmio", control: "input" as const, value: "336" }] };
  return {
    customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`,
    workflow: { supportedPages: ["Beneficiario", "Calcolo costi e detrazioni"], screeningItemCount: 1, steps: [{ id: "beneficiary", ...runtime }, calculation], screeningSteps: [{ id: "screening-1", ...runtime, pageName: "Schermatura 1" }] },
    safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
  };
}

function allocationDraftPackage(customerKey: string): AprEneaDraftPackage {
  const allocation = { id: "allocation", pageName: "Allocazione costi e detrazioni", markerIds: ["id-costo2025p"], successMessage: "ok", fields: [{ portalId: "id-costo2025p", control: "input" as const, value: "3050" }] };
  const calculation = { id: "calculation", pageName: "Calcolo costi e detrazioni", markerIds: ["id-risparmio"], successMessage: "ok", fields: [{ portalId: "id-risparmio", control: "input" as const, value: "336" }] };
  return {
    customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`,
    workflow: { supportedPages: ["Allocazione costi e detrazioni", "Calcolo costi e detrazioni"], screeningItemCount: 0, steps: [allocation, calculation], screeningSteps: [] },
    safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
  };
}

describe("APR browser worker persistente e autonomo", () => {
  it("mantiene staged l'allocazione 36% fino al Salva Calcolo e la verifica lato server solo dopo", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare({
      status: "completed",
      sourceFingerprint: "allocation-outer-save-source",
      items: [{
        customerKey: "case-allocation",
        displayName: "Case Allocation",
        practiceId: "crm-allocation",
        state: "ready_local_plan",
        report: { eneaPayloadAudit: { draftReady: true, mappingFingerprint: "mapping-allocation", requiredPortalFieldCount: 2, portalGate: { status: "ready", workflowFingerprint: "workflow-case-allocation", supportedPages: ["Allocazione costi e detrazioni", "Calcolo costi e detrazioni"], screeningItemCount: 0 } } },
      }, {
        customerKey: "case-isolated-fixture",
        displayName: "Case Isolated Fixture",
        practiceId: "crm-isolated-fixture",
        state: "blocked_case",
        report: { outcome: "blocked_case", blockers: [{ code: "fixture" }] },
      }],
    } as never, new Date("2026-08-18T08:00:00.000Z"));
    const driver = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-allocation-outer-save" });
    const worker = new PersistentAprEneaBrowserWorker(directory, execution, allocationDraftPackage, driver, { instanceId: "apr-worker-allocation-outer-save", processPid: 4217 });

    const completed = await worker.runUntilTerminal();
    const events = driver.snapshot().events;
    const saveAllocation = events.findIndex((event) => event.action === "save_page" && event.pageId === "page:Allocazione costi e detrazioni");
    const saveCalculation = events.findIndex((event) => event.action === "save_page" && event.pageId === "page:Calcolo costi e detrazioni");
    const verifyAllocation = events.findIndex((event) => event.action === "verify_page_saved_readonly" && event.pageId === "page:Allocazione costi e detrazioni");

    expect(completed).toMatchObject({ status: "completed", completedCustomerKeys: ["case-allocation"], blockedCustomerKeys: [] });
    expect(saveAllocation).toBeGreaterThanOrEqual(0);
    expect(saveCalculation).toBeGreaterThan(saveAllocation);
    expect(verifyAllocation).toBeGreaterThan(saveCalculation);
    expect(events.slice(saveAllocation + 1, saveCalculation).some((event) => event.pageId === "page:Allocazione costi e detrazioni" && event.action.includes("verify"))).toBe(false);
    const item = execution.snapshot().items[0];
    expect(item).toMatchObject({ state: "saved", completedPageIds: ["page:Allocazione costi e detrazioni", "page:Calcolo costi e detrazioni"] });
    expect(item.pageCheckpoints.find((page) => page.pageId === "page:Allocazione costi e detrazioni")?.savedEvidenceId).toContain("sim-server");
    expect(execution.snapshot().audit.some((event) => event.type === "nested_page_server_verified_after_outer_save")).toBe(true);
  });

  it("esegue due pratiche consecutive e riprende da un crash senza perdita o duplicazione", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    let clock = new Date("2026-08-15T18:00:01.000Z");
    const firstDriver = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-a", crashAfterMutation: "save:case-two:page:Beneficiario" });
    const firstWorker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, firstDriver, { instanceId: "apr-worker-before-restart", processPid: 4101, now: () => clock });

    await expect(firstWorker.runUntilTerminal()).rejects.toBeInstanceOf(AprSimulatedProcessCrash);
    const afterCrash = execution.snapshot(clock);
    expect(afterCrash.progress.saved).toBe(1);
    expect(afterCrash.resume).toMatchObject({ action: "verify_page_saved_state_readonly", customerKey: "case-two", pageId: "page:Beneficiario" });

    clock = new Date("2026-08-15T18:00:20.000Z");
    const restartedDriver = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-a" });
    const restartedWorker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, restartedDriver, { instanceId: "apr-worker-after-restart", processPid: 4102, now: () => clock });
    const completed = await restartedWorker.runUntilTerminal();

    const queueProof = execution.snapshot(clock);
    const serverProof = restartedDriver.snapshot();
    expect(completed).toMatchObject({ status: "completed", completedCustomerKeys: ["case-one", "case-two"], forbiddenActionCount: 0, previewAttemptCount: 0, submitAttemptCount: 0, communicationAttemptCount: 0 });
    expect(queueProof).toMatchObject({ status: "completed", progress: { saved: 2, blocked: 0, queued: 0, active: 0 } });
    expect(queueProof.items.every((item) => item.createAttemptCount === 1 && item.saveAttemptCount === 1 && item.pageCheckpoints.every((page) => page.saveAttemptCount === 1 && page.state === "saved"))).toBe(true);
    expect(serverProof.drafts).toHaveLength(2);
    expect(serverProof.drafts.every((draft) => draft.createMutationCount === 1 && Object.values(draft.pageSaveMutationCounts).every((count) => count === 1))).toBe(true);
    expect(new Set(serverProof.drafts.map((draft) => draft.customerKey))).toEqual(new Set(["case-one", "case-two"]));
    expect(completed.audit.every((event) => event.executorKind === "apr_browser_worker" && event.processPid > 0 && event.appliedRuleIds.length > 0)).toBe(true);
    expect(completed.audit.some((event) => event.instanceId === "apr-worker-before-restart")).toBe(true);
    expect(completed.audit.some((event) => event.instanceId === "apr-worker-after-restart")).toBe(true);
    expect(serverProof.events.some((event) => event.action === "verify_page_saved_readonly" && event.customerKey === "case-two")).toBe(true);
  });

  it("isola un blocco per-pratica e passa automaticamente alla successiva", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    const base = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-block-test" });
    const driver: AprEneaBrowserDriver = {
      ...base,
      kind: base.kind,
      identity: base.identity,
      verifySession: base.verifySession.bind(base),
      discoverExistingDraft: base.discoverExistingDraft.bind(base),
      createDraft: base.createDraft.bind(base),
      preparePage: async (draft, draftId, pageId) => {
        if (draft.customerKey === "case-one") throw new Error("fixture_case_ambiguous");
        return base.preparePage(draft, draftId, pageId);
      },
      savePage: base.savePage.bind(base),
      verifyPageSaved: base.verifyPageSaved.bind(base),
      verifyDraftSaved: base.verifyDraftSaved.bind(base),
    };
    const worker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, driver, { instanceId: "apr-worker-case-isolation", processPid: 4201 });
    const completed = await worker.runUntilTerminal();
    const queue = execution.snapshot();

    expect(completed).toMatchObject({ status: "completed", blockedCustomerKeys: ["case-one"], completedCustomerKeys: ["case-two"] });
    expect(queue).toMatchObject({ status: "completed", progress: { saved: 1, blocked: 1, queued: 0, active: 0 } });
    expect(queue.items.find((item) => item.customerKey === "case-one")).toMatchObject({ state: "operator_intervention", createAttemptCount: 1 });
    expect(queue.items.find((item) => item.customerKey === "case-two")).toMatchObject({ state: "saved", createAttemptCount: 1, saveAttemptCount: 1 });
    expect(base.snapshot().drafts).toHaveLength(2);
  });

  it("isola anche un payload incoerente senza trasformarlo in blocco globale", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    const driver = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-package-isolation" });
    const provider = (customerKey: string) => {
      if (customerKey === "case-one") throw new Error("crm_enea_draft_package_fingerprint_mismatch");
      return draftPackage(customerKey);
    };
    const worker = new PersistentAprEneaBrowserWorker(directory, execution, provider, driver, { instanceId: "apr-worker-package-isolation", processPid: 4202 });

    const completed = await worker.runUntilTerminal();
    expect(completed).toMatchObject({ status: "completed", blockedCustomerKeys: ["case-one"], completedCustomerKeys: ["case-two"] });
    expect(execution.snapshot()).toMatchObject({ status: "completed", progress: { saved: 1, blocked: 1, queued: 0, active: 0 } });
    expect(driver.snapshot().drafts.map((draft) => draft.customerKey)).toEqual(["case-two"]);
  });

  it("non considera il click Salva una prova e non lo ripete se la rilettura server fallisce", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    const base = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-save-proof" });
    const driver: AprEneaBrowserDriver = {
      ...base, kind: base.kind, identity: base.identity,
      verifySession: base.verifySession.bind(base), discoverExistingDraft: base.discoverExistingDraft.bind(base), createDraft: base.createDraft.bind(base),
      preparePage: base.preparePage.bind(base), savePage: base.savePage.bind(base), verifyPageSaved: async (draft, draftId, pageId) => draft.customerKey === "case-one" ? null : base.verifyPageSaved(draft, draftId, pageId), verifyDraftSaved: base.verifyDraftSaved.bind(base),
    };
    const worker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, driver, { instanceId: "apr-worker-save-proof", processPid: 4205 });
    const completed = await worker.runUntilTerminal();

    expect(completed).toMatchObject({ status: "completed", blockedCustomerKeys: ["case-one"], completedCustomerKeys: ["case-two"] });
    expect(execution.snapshot().items.find((item) => item.customerKey === "case-one")).toMatchObject({ state: "operator_intervention", pageCheckpoints: expect.arrayContaining([expect.objectContaining({ pageId: "page:Beneficiario", state: "save_intent_recorded", saveAttemptCount: 1 })]) });
    expect(base.snapshot().drafts.find((draft) => draft.customerKey === "case-one")?.pageSaveMutationCounts["page:Beneficiario"]).toBe(1);
  });

  it("risolve automaticamente con prove read-only e continua sulla stessa bozza senza duplicare il Salva", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    const base = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-readonly-auto-recovery" });
    const driver: AprEneaBrowserDriver = {
      ...base, kind: base.kind, identity: base.identity,
      verifySession: base.verifySession.bind(base), discoverExistingDraft: base.discoverExistingDraft.bind(base), createDraft: base.createDraft.bind(base),
      preparePage: base.preparePage.bind(base), savePage: base.savePage.bind(base),
      verifyPageSaved: async (draft, draftId, pageId) => draft.customerKey === "case-one" && pageId === "page:Beneficiario" ? null : base.verifyPageSaved(draft, draftId, pageId),
      probePageSaveReadOnly: base.probePageSaveReadOnly.bind(base),
      verifyDraftSaved: base.verifyDraftSaved.bind(base),
    };
    const worker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, driver, { instanceId: "apr-worker-readonly-auto-recovery", processPid: 4206 });
    const completed = await worker.runUntilTerminal();

    expect(completed).toMatchObject({ status: "completed", completedCustomerKeys: ["case-one", "case-two"], blockedCustomerKeys: [] });
    const recovered = execution.snapshot().items.find((item) => item.customerKey === "case-one")!;
    expect(recovered).toMatchObject({ state: "saved", draftId: expect.any(String), uncertainPageSave: { pageId: "page:Beneficiario", status: "resolved_saved" } });
    expect(recovered.uncertainPageSave?.probes).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "server_redirect", outcome: "inconclusive" }),
      expect.objectContaining({ method: "persisted_fields_get", outcome: "saved" }),
    ]));
    const serverDraft = base.snapshot().drafts.find((draft) => draft.customerKey === "case-one")!;
    expect(serverDraft.createMutationCount).toBe(1);
    expect(serverDraft.pageSaveMutationCounts["page:Beneficiario"]).toBe(1);
    expect(Object.values(serverDraft.pageSaveMutationCounts).every((count) => count === 1)).toBe(true);
    expect(completed.audit.some((event) => event.action === "uncertain_page_save_auto_resolved")).toBe(true);
  });

  it("dopo tre prove inconcludenti isola solo il caso e completa il successivo senza perdita di coda", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    const base = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-readonly-operator-gate" });
    const driver: AprEneaBrowserDriver = {
      ...base, kind: base.kind, identity: base.identity,
      verifySession: base.verifySession.bind(base), discoverExistingDraft: base.discoverExistingDraft.bind(base), createDraft: base.createDraft.bind(base),
      preparePage: base.preparePage.bind(base), savePage: base.savePage.bind(base),
      verifyPageSaved: async (draft, draftId, pageId) => draft.customerKey === "case-one" && pageId === "page:Beneficiario" ? null : base.verifyPageSaved(draft, draftId, pageId),
      probePageSaveReadOnly: async (draft, _draftId, _pageId) => ([
        { method: "server_redirect", outcome: "inconclusive", reason: "Nessun avanzamento osservabile.", evidenceId: `${draft.customerKey}-redirect`, observedAt: "2026-08-15T18:00:10.000Z", url: "https://bonusfiscali.enea.it/" },
        { method: "persisted_fields_get", outcome: "inconclusive", reason: "Valori parziali.", evidenceId: `${draft.customerKey}-fields`, observedAt: "2026-08-15T18:00:11.000Z", url: "https://bonusfiscali.enea.it/" },
        { method: "server_metadata_get", outcome: "inconclusive", reason: "Metadato non discriminante.", evidenceId: `${draft.customerKey}-metadata`, observedAt: "2026-08-15T18:00:12.000Z", url: "https://bonusfiscali.enea.it/" },
      ]),
      verifyDraftSaved: base.verifyDraftSaved.bind(base),
    };
    const worker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, driver, { instanceId: "apr-worker-readonly-operator-gate", processPid: 4207 });
    const completed = await worker.runUntilTerminal();

    expect(completed).toMatchObject({ status: "completed", blockedCustomerKeys: ["case-one"], completedCustomerKeys: ["case-two"] });
    const checkpoint = new PersistentAprEneaDraftExecution(directory).snapshot();
    expect(checkpoint).toMatchObject({ status: "completed", progress: { saved: 1, blocked: 1, queued: 0, active: 0 } });
    expect(checkpoint.items.find((item) => item.customerKey === "case-one")).toMatchObject({ state: "operator_intervention", uncertainPageSave: { status: "operator_required", probes: expect.arrayContaining([
      expect.objectContaining({ method: "server_redirect" }),
      expect.objectContaining({ method: "persisted_fields_get" }),
      expect.objectContaining({ method: "server_metadata_get" }),
    ]) } });
    expect(base.snapshot().drafts.find((draft) => draft.customerKey === "case-one")?.pageSaveMutationCounts["page:Beneficiario"]).toBe(1);
  });

  it("interrompe le sonde residue quando la GET canonica autorizza il recupero automatico", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    const base = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-conclusive-not-saved" });
    const driver: AprEneaBrowserDriver = {
      ...base, kind: base.kind, identity: base.identity,
      verifySession: base.verifySession.bind(base), discoverExistingDraft: base.discoverExistingDraft.bind(base), createDraft: base.createDraft.bind(base),
      preparePage: base.preparePage.bind(base), savePage: base.savePage.bind(base), verifyPageSaved: async (draft, draftId, pageId) => draft.customerKey === "case-one" ? null : base.verifyPageSaved(draft, draftId, pageId),
      probePageSaveReadOnly: async (draft, draftId, pageId) => draft.customerKey === "case-one" ? ([
        { method: "server_redirect", outcome: "inconclusive", reason: "Nessun redirect.", evidenceId: `redirect-${draftId}`, observedAt: "2026-08-15T18:00:10.000Z", url: `https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/${draftId}` },
        { method: "persisted_fields_get", outcome: "not_saved", reason: "Campi vuoti.", evidenceId: `not-saved-${draftId}`, observedAt: "2026-08-15T18:00:11.000Z", url: `https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/${draftId}` },
        { method: "server_metadata_get", outcome: "inconclusive", reason: "Metadato non discriminante.", evidenceId: `metadata-${draftId}`, observedAt: "2026-08-15T18:00:12.000Z", url: `https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/${draftId}` },
      ]) : base.probePageSaveReadOnly(draft, draftId, pageId),
      verifyDraftSaved: base.verifyDraftSaved.bind(base),
    };
    const worker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, driver, { instanceId: "apr-worker-conclusive-not-saved", processPid: 4210 });
    const completed = await worker.runUntilTerminal();
    const item = execution.snapshot().items[0];

    expect(completed).toMatchObject({ status: "completed", blockedCustomerKeys: ["case-one"], completedCustomerKeys: ["case-two"] });
    expect(item.uncertainPageSave?.probes.some((probe) => probe.method === "persisted_fields_get" && probe.outcome === "not_saved")).toBe(true);
    expect(item.uncertainPageSave?.probes.some((probe) => probe.method === "server_metadata_get")).toBe(false);
    expect(item.pageCheckpoints[0]).toMatchObject({ saveAttemptCount: 1, recoverySaveAttemptCount: 1 });
    expect(base.snapshot().drafts[0].pageSaveMutationCounts["page:Beneficiario"]).toBe(1);
  });

  it("non effettua un terzo Salva se anche l'unico recupero autorizzato termina con timeout", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    const base = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-recovery-timeout" });
    const firstDriver: AprEneaBrowserDriver = {
      ...base, kind: base.kind, identity: base.identity,
      verifySession: base.verifySession.bind(base), discoverExistingDraft: base.discoverExistingDraft.bind(base), createDraft: base.createDraft.bind(base),
      preparePage: base.preparePage.bind(base), savePage: base.savePage.bind(base), verifyPageSaved: async (draft, draftId, pageId) => draft.customerKey === "case-one" ? null : base.verifyPageSaved(draft, draftId, pageId),
      probePageSaveReadOnly: async (draft, draftId, pageId) => draft.customerKey === "case-one" ? [{ method: "persisted_fields_get", outcome: "not_saved", reason: "Fixture operatore: pagina non persistita.", evidenceId: `not-saved-${pageId}`, observedAt: "2026-08-15T18:00:10.000Z", url: "https://bonusfiscali.enea.it/" }] : base.probePageSaveReadOnly(draft, draftId, pageId),
      verifyDraftSaved: base.verifyDraftSaved.bind(base),
    };
    const firstWorker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, firstDriver, { instanceId: "apr-worker-recovery-timeout", processPid: 4208 });
    expect(await firstWorker.runUntilTerminal()).toMatchObject({ status: "completed", blockedCustomerKeys: ["case-one"], completedCustomerKeys: ["case-two"] });
    execution.recordUncertainPageSaveOperatorDecision("case-one", "not_saved", "operatore-test", "operator-not-saved-proof", "Pagina verificata non persistita.", "recovery-timeout:operator");

    const recoveryDriver: AprEneaBrowserDriver = {
      ...base, kind: base.kind, identity: base.identity,
      verifySession: base.verifySession.bind(base), discoverExistingDraft: base.discoverExistingDraft.bind(base), createDraft: base.createDraft.bind(base),
      preparePage: base.preparePage.bind(base),
      savePage: async (draft, draftId, pageId) => { await base.savePage(draft, draftId, pageId); throw new Error("apr_cdp_command_timeout:Runtime.evaluate"); },
      verifyPageSaved: base.verifyPageSaved.bind(base), probePageSaveReadOnly: base.probePageSaveReadOnly.bind(base), verifyDraftSaved: base.verifyDraftSaved.bind(base),
    };
    const recoveryWorker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, recoveryDriver, { instanceId: "apr-worker-recovery-timeout", processPid: 4208 });
    expect(await recoveryWorker.runUntilTerminal()).toMatchObject({ status: "completed", completedCustomerKeys: ["case-two"], blockedCustomerKeys: ["case-one"] });
    const final = execution.snapshot().items[0];
    expect(final).toMatchObject({ state: "operator_intervention", uncertainPageSave: { status: "operator_required", reason: expect.stringContaining("unico recupero") } });
    expect(final.pageCheckpoints[0]).toMatchObject({ saveAttemptCount: 1, recoverySaveAttemptCount: 1, state: "save_intent_recorded" });
    expect(base.snapshot().drafts[0].pageSaveMutationCounts["page:Beneficiario"]).toBe(1);
  });

  it("classifica il recupero senza prova server senza richiamare la procedura del primo esito incerto", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    const base = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-recovery-null-proof" });
    const firstDriver: AprEneaBrowserDriver = {
      ...base, kind: base.kind, identity: base.identity,
      verifySession: base.verifySession.bind(base), discoverExistingDraft: base.discoverExistingDraft.bind(base), createDraft: base.createDraft.bind(base),
      preparePage: base.preparePage.bind(base), savePage: base.savePage.bind(base), verifyPageSaved: async (draft, draftId, pageId) => draft.customerKey === "case-one" ? null : base.verifyPageSaved(draft, draftId, pageId),
      probePageSaveReadOnly: async (draft, draftId, pageId) => draft.customerKey === "case-one" ? [{ method: "persisted_fields_get", outcome: "not_saved", reason: "Pagina non persistita.", evidenceId: `not-saved-${pageId}`, observedAt: "2026-08-15T18:00:10.000Z", url: "https://bonusfiscali.enea.it/" }] : base.probePageSaveReadOnly(draft, draftId, pageId),
      verifyDraftSaved: base.verifyDraftSaved.bind(base),
    };
    const firstWorker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, firstDriver, { instanceId: "apr-worker-recovery-null-proof", processPid: 4209 });
    await firstWorker.runUntilTerminal();
    execution.recordUncertainPageSaveOperatorDecision("case-one", "not_saved", "operatore-test", "operator-not-saved-proof", "Pagina verificata non persistita.", "recovery-null:operator");

    const recoveryDriver: AprEneaBrowserDriver = {
      ...base, kind: base.kind, identity: base.identity,
      verifySession: base.verifySession.bind(base), discoverExistingDraft: base.discoverExistingDraft.bind(base), createDraft: base.createDraft.bind(base),
      preparePage: base.preparePage.bind(base), savePage: base.savePage.bind(base), verifyPageSaved: async () => null,
      probePageSaveReadOnly: base.probePageSaveReadOnly.bind(base), verifyDraftSaved: base.verifyDraftSaved.bind(base),
    };
    const recoveryWorker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, recoveryDriver, { instanceId: "apr-worker-recovery-null-proof", processPid: 4209 });
    const completed = await recoveryWorker.runUntilTerminal();
    expect(completed).toMatchObject({ status: "completed", completedCustomerKeys: ["case-two"], blockedCustomerKeys: ["case-one"] });
    expect(execution.snapshot().items[0]).toMatchObject({ state: "operator_intervention", uncertainPageSave: { status: "operator_required", reason: expect.stringContaining("unico recupero") } });
    expect(execution.snapshot().audit.some((event) => event.type === "uncertain_page_save_recovery_failed")).toBe(true);
  });

  it("riaccoda due intenti non materializzati senza azzerare il contatore e li completa in sequenza", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    const base = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-recovery" });
    const failingDriver: AprEneaBrowserDriver = {
      ...base, kind: base.kind, identity: base.identity,
      verifySession: base.verifySession.bind(base), discoverExistingDraft: base.discoverExistingDraft.bind(base),
      createDraft: async () => { throw new Error("apr_cdp_enea_create_result_not_identifiable"); },
      preparePage: base.preparePage.bind(base), savePage: base.savePage.bind(base), verifyPageSaved: base.verifyPageSaved.bind(base), verifyDraftSaved: base.verifyDraftSaved.bind(base),
    };
    const firstWorker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, failingDriver, { instanceId: "apr-worker-recovery-before", processPid: 4203 });
    expect(await firstWorker.runUntilTerminal({ maxTicks: 100 })).toMatchObject({ status: "completed", blockedCustomerKeys: ["case-one", "case-two"] });

    execution.requeueUnmaterializedCreateIntents(["case-one", "case-two"], "wizard-contract-fixture", "recovery:two-unmaterialized:v1");
    const recoveredWorker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, base, { instanceId: "apr-worker-recovery-before", processPid: 4203 });
    expect(await recoveredWorker.runUntilTerminal()).toMatchObject({ status: "completed", completedCustomerKeys: ["case-one", "case-two"] });
    const recovered = execution.snapshot();
    expect(recovered).toMatchObject({ status: "completed", progress: { saved: 2, blocked: 0, queued: 0, active: 0 } });
    expect(recovered.items.every((item) => item.createAttemptCount === 1 && item.recoverableCreateIntent === false)).toBe(true);
    expect(recoveredWorker.snapshot()).toMatchObject({ completedCustomerKeys: ["case-one", "case-two"], blockedCustomerKeys: [] });
  });

  it("ferma la coda prima di contaminare il caso successivo quando esiste un sotto-checkpoint di creazione pendente", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    const base = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-pending-barrier" });
    const barrierDriver: AprEneaBrowserDriver = {
      ...base,
      kind: base.kind,
      identity: base.identity,
      verifySession: base.verifySession.bind(base),
      discoverExistingDraft: base.discoverExistingDraft.bind(base),
      createDraft: async () => { throw new Error("apr_cdp_enea_create_result_not_identifiable"); },
      preparePage: base.preparePage.bind(base),
      savePage: base.savePage.bind(base),
      verifyPageSaved: base.verifyPageSaved.bind(base),
      verifyDraftSaved: base.verifyDraftSaved.bind(base),
      pendingCreationBarrier: () => ({ customerKey: "case-one", evidenceId: "pending-create-case-one" }),
    };
    const worker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, barrierDriver, { instanceId: "apr-worker-pending-barrier", processPid: 4210 });

    const stopped = await worker.runUntilTerminal({ maxTicks: 100 });

    expect(stopped).toMatchObject({ status: "technical_block", currentCustomerKey: null, currentAction: "pending_creation_barrier" });
    expect(execution.snapshot().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ customerKey: "case-one", state: "operator_intervention", createAttemptCount: 1 }),
      expect.objectContaining({ customerKey: "case-two", state: "queued", createAttemptCount: 0, draftId: null }),
    ]));
    expect(worker.snapshot().audit.some((event) => event.action === "pending_creation_barrier" && event.evidenceId === "pending-create-case-one")).toBe(true);
  });

  it("reclama davvero lo stesso caso dopo una seconda riaccodatura senza collidere con la chiave idempotente precedente", async () => {
    const directory = temporaryDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(preflightFixture(), new Date("2026-08-15T18:00:00.000Z"));
    const base = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-multi-recovery" });
    const failingDriver: AprEneaBrowserDriver = {
      ...base, kind: base.kind, identity: base.identity,
      verifySession: base.verifySession.bind(base), discoverExistingDraft: base.discoverExistingDraft.bind(base),
      createDraft: async () => { throw new Error("apr_cdp_enea_creation_wizard_contract_invalid:fixture"); },
      preparePage: base.preparePage.bind(base), savePage: base.savePage.bind(base), verifyPageSaved: base.verifyPageSaved.bind(base), verifyDraftSaved: base.verifyDraftSaved.bind(base),
    };

    const firstWorker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, failingDriver, { instanceId: "apr-worker-multi-recovery", processPid: 4301 });
    expect(await firstWorker.runUntilTerminal()).toMatchObject({ status: "completed", blockedCustomerKeys: ["case-one", "case-two"] });
    execution.requeueUnmaterializedCreateIntents(["case-one"], "wizard-contract-v1", "recovery:case-one:v1");

    const secondWorker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, failingDriver, { instanceId: "apr-worker-multi-recovery", processPid: 4301 });
    expect(await secondWorker.runUntilTerminal({ maxTicks: 100 })).toMatchObject({ status: "completed", blockedCustomerKeys: ["case-one", "case-two"] });
    execution.requeueUnmaterializedCreateIntents(["case-one"], "wizard-contract-v2", "recovery:case-one:v2");

    const recoveredWorker = new PersistentAprEneaBrowserWorker(directory, execution, draftPackage, base, { instanceId: "apr-worker-multi-recovery", processPid: 4301 });
    expect(await recoveredWorker.runUntilTerminal({ maxTicks: 100 })).toMatchObject({ status: "completed", completedCustomerKeys: ["case-one"] });
    expect(execution.snapshot()).toMatchObject({ status: "completed", progress: { saved: 1, blocked: 1, queued: 0, active: 0 } });
    expect(base.snapshot().drafts).toHaveLength(1);
  });

  it("registra di nuovo il gate finale dopo una correzione verificata sulla stessa bozza", async () => {
    const directory = temporaryDirectory();
    const original = preflightFixture(["case-one", "case-two"]) as any;
    original.items[0].report.buildingQualification = "multi_unit";
    original.items[0].report.buildingUnitCount = 1;
    original.items[0].report.eneaPayloadAudit.portalGate.supportedPages = ["Beneficiario", "Immobile"];
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare(original, new Date("2026-08-15T18:00:00.000Z"));
    const base = new PersistentSimulatedEneaPortalDriver(directory, { identity: "apr-profile-final-gate-recovery" });
    const packageProvider = (customerKey: string) => {
      const value = draftPackage(customerKey);
      const beneficiary = value.workflow.steps[0]!;
      value.workflow.supportedPages = ["Beneficiario", "Immobile"];
      value.workflow.steps.splice(1, 0, { ...beneficiary, id: "immobile", pageName: "Immobile" });
      return value;
    };
    const worker = new PersistentAprEneaBrowserWorker(directory, execution, packageProvider, base, { instanceId: "apr-worker-final-gate-recovery", processPid: 4401 });
    await worker.runUntilTerminal();

    const corrected = structuredClone(original) as any;
    corrected.items[0].report.buildingQualification = "single_unit";
    corrected.items[0].report.buildingUnitCount = 1;
    corrected.items[0].report.eneaPayloadAudit.mappingFingerprint = "mapping-case-one-single-unit";
    corrected.items[0].report.eneaPayloadAudit.portalGate.workflowFingerprint = "workflow-case-one-single-unit";
    execution.recordSavedPayloadPostCompletionVerificationIntent("case-one", "mapping-case-one-single-unit", "final-gate-recovery:verification-intent:v1");
    execution.requeueSavedDraftPageAfterVerifiedPayloadCorrection(corrected, "case-one", "page:Immobile", "readonly-old-building-type", "final-gate-recovery:requeue");
    execution.recordSessionReady("session-proof-correction", "final-gate-recovery:session");
    execution.claimVerifiedPayloadCorrectionRecovery("case-one", "final-gate-recovery:claim");

    const completed = await worker.runUntilTerminal();
    expect(completed).toMatchObject({ status: "completed", completedCustomerKeys: expect.arrayContaining(["case-one"]) });
    expect(execution.snapshot().items[0]).toMatchObject({ state: "saved", saveAttemptCount: 1, mappingFingerprint: "mapping-case-one-single-unit" });
    expect(execution.snapshot().audit.filter((event) => event.type === "save_intent_recorded" && event.customerKey === "case-one")).toHaveLength(2);
  });

});
