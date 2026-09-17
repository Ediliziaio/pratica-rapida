import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentAprCanonicalDraftPackages } from "./aprCanonicalDraftPackages";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";
import { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const fixture = (customerKey: string, marker = "a"): AprEneaDraftPackage => ({
  customerKey, displayName: customerKey, practiceId: `practice-${customerKey}`,
  packageFingerprint: hash(`package-${customerKey}-${marker}`), workflowFingerprint: hash(`workflow-${customerKey}-${marker}`),
  module: "screening",
  workflow: { supportedPages: [], steps: [], screeningSteps: [] } as never,
  safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
});

describe("pacchetto eseguibile canonico", () => {
  it("costruisce una volta e rilegge gli stessi byte senza richiamare il builder", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-canonical-package-")); roots.push(root);
    const store = new PersistentAprCanonicalDraftPackages(root); const source = hash("source-a");
    const first = store.freeze(source, [fixture("cliente-a")], new Date("2026-09-09T10:00:00Z"));
    const artifact = readFileSync(path.join(root, "canonical-draft-packages", "packages", `${first[0].packageFingerprint}.json`));
    const second = store.loadManifestPackages(source)!;
    expect(second).toEqual(first);
    expect(readFileSync(path.join(root, "canonical-draft-packages", "packages", `${second[0].packageFingerprint}.json`))).toEqual(artifact);
  });

  it("fallisce chiuso se l'artefatto immutabile viene alterato", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-canonical-package-tamper-")); roots.push(root);
    const store = new PersistentAprCanonicalDraftPackages(root); const source = hash("source-b");
    const [stored] = store.freeze(source, [fixture("cliente-b")]);
    writeFileSync(path.join(root, "canonical-draft-packages", "packages", `${stored.packageFingerprint}.json`), "{}\n");
    expect(() => store.loadManifestPackages(source)).toThrow("apr_canonical_package_artifact_hash_mismatch");
  });

  it("non accetta collisioni o pacchetti che autorizzano preview, submit o comunicazioni", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-canonical-package-safety-")); roots.push(root);
    const store = new PersistentAprCanonicalDraftPackages(root);
    expect(() => store.freeze(hash("source-c"), [{ ...fixture("cliente-c"), safety: { ...fixture("cliente-c").safety, submitAllowed: true } } as never])).toThrow("apr_canonical_draft_package_invalid");
  });

  it("il worker consuma il piano esatto persistito dal preflight anche se dossier e analisi cambiano dopo il verdetto", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-canonical-preflight-e2e-")); roots.push(root);
    const dossierPath = path.join(root, "dossier.json");
    writeFileSync(dossierPath, JSON.stringify({ row: { cliente_nome: "Valore originario" } }));
    const mappingFingerprint = "mapping-preflight-v1";
    const workflowFingerprint = hash("workflow-preflight-v1");
    const executablePlan = {
      mappingFingerprint,
      workflowFingerprint,
      payload: { mode: "draft_test", practiceCode: "CRM-PRACTICE", fields: [{ id: "beneficiario.nome", value: "Mario" }], portalFields: [] },
      workflow: { script: "persisted-preflight-script", supportedPages: ["Beneficiario"], steps: [], screeningSteps: [], screeningItemCount: 0, preparedFieldIds: ["beneficiario.nome"] },
    };
    mkdirSync(path.join(root, "crm-local-preflight"), { recursive: true });
    writeFileSync(path.join(root, "crm-local-preflight/checkpoint.json"), JSON.stringify({
      version: "apr-crm-local-preflight-v1", revision: 1, status: "completed", sourceFingerprint: hash("source-preflight-v1"),
      currentCustomerKey: null, externalActionAllowed: false, reason: "test", nextAction: "test",
      validationRevisionsApplied: [], sourceRevisionsApplied: [], operatorMeasurementResolutions: [], audit: [],
      items: [{ customerKey: "cliente-a", displayName: "Cliente A", practiceId: "practice-a", dossierPath, state: "ready_local_plan", attemptCount: 1, startedAt: null, endedAt: null, reason: "ready", disposition: null,
        report: { outcome: "ready_local_plan", eneaPayloadAudit: { draftReady: true, mappingFingerprint, portalGate: { status: "ready", workflowFingerprint } }, eneaExecutablePlan: executablePlan } }],
    }, null, 2));
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("builder_must_not_run"); });
    analysis.initialize();

    // Simula lo stesso tipo di deriva osservato su Falconi. Il worker deve
    // ignorarla: il suo input eseguibile e' gia' stato congelato dal preflight.
    writeFileSync(dossierPath, JSON.stringify({ row: { cliente_nome: "Valore mutato dopo il preflight" } }));
    const draftPackage = new PersistentAprCrmLocalPreflight(root, analysis).buildDraftExecutionPackage("cliente-a");
    expect(draftPackage).toMatchObject({ customerKey: "cliente-a", practiceId: "practice-a", mappingFingerprint, workflowFingerprint });
    expect((draftPackage as never as { payload: unknown }).payload).toEqual(executablePlan.payload);
    expect(draftPackage.workflow.script).toBe("persisted-preflight-script");
  });

  it("fallisce chiuso se piano eseguibile e audit del preflight non coincidono", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-canonical-preflight-audit-mismatch-")); roots.push(root);
    const dossierPath = path.join(root, "dossier.json"); writeFileSync(dossierPath, "{}\n");
    mkdirSync(path.join(root, "crm-local-preflight"), { recursive: true });
    writeFileSync(path.join(root, "crm-local-preflight/checkpoint.json"), JSON.stringify({
      version: "apr-crm-local-preflight-v1", revision: 1, status: "completed", sourceFingerprint: hash("source-preflight-v2"),
      currentCustomerKey: null, externalActionAllowed: false, reason: "test", nextAction: "test",
      validationRevisionsApplied: [], sourceRevisionsApplied: [], operatorMeasurementResolutions: [], audit: [],
      items: [{ customerKey: "cliente-b", displayName: "Cliente B", practiceId: "practice-b", dossierPath, state: "ready_local_plan", attemptCount: 1, startedAt: null, endedAt: null, reason: "ready", disposition: null,
        report: { outcome: "ready_local_plan", eneaPayloadAudit: { draftReady: true, mappingFingerprint: "mapping-audit", portalGate: { status: "ready", workflowFingerprint: hash("workflow-audit") } },
          eneaExecutablePlan: { mappingFingerprint: "mapping-tampered", workflowFingerprint: hash("workflow-audit"), payload: { mode: "draft_test", practiceCode: "CRM-PRACTICE", fields: [], portalFields: [] }, workflow: { script: "tampered", supportedPages: [], steps: [], screeningSteps: [], screeningItemCount: 0, preparedFieldIds: [] } } } }],
    }, null, 2));
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    expect(() => new PersistentAprCrmLocalPreflight(root, analysis).buildDraftExecutionPackage("cliente-b"))
      .toThrow("crm_enea_canonical_preflight_package_audit_mismatch");
  });
});
