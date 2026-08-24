import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentAprInfissiBatchPreflight } from "./infissiBatchPreflight";

const roots: string[] = [];
function writeJson(target: string, value: unknown) { mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); }

function fixtureRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-infissi-batch-")); roots.push(root);
  const cases = [
    { key: "ready", name: "Caso Ready", id: "practice-ready", technical: "Finestra dimensioni: 1000 x 1200, Pezzi: 1, Trasmittanza termica 1,2 W/m2K", financial: true },
    { key: "blocked", name: "Caso Blocked", id: "practice-blocked", technical: "Documento privo di misure tecniche.", financial: true },
  ];
  const acquisitionItems = cases.map((item) => {
    const dossierPath = path.join(root, "crm-acquisition", "dossiers", `${item.key}.json`);
    writeJson(dossierPath, { row: { dati_form: { prodotto: { materiale_nuovi: "pvc", vetro_nuovi: "doppio", materiale_vecchi: "legno", vetro_vecchi: "singolo", zanzariere_tapparelle_persiane: false } } } });
    return { customerKey: item.key, displayName: item.name, practiceId: item.id, dossierPath, state: "acquired", responseSha256: `sha-${item.key}` };
  });
  const analysisItems = cases.map((item) => {
    const textPath = path.join(root, "crm-document-analysis", "text", item.key, "doc.txt");
    mkdirSync(path.dirname(textPath), { recursive: true }); writeFileSync(textPath, item.technical);
    return { customerKey: item.key, documentKey: `${item.key}-doc`, kind: "additional", textPath, state: "analyzed" };
  });
  writeJson(path.join(root, "crm-acquisition", "checkpoint.json"), { status: "completed", items: acquisitionItems });
  writeJson(path.join(root, "crm-document-analysis", "checkpoint.json"), { status: "completed", items: analysisItems });
  writeJson(path.join(root, "crm-local-preflight", "checkpoint.json"), { status: "completed", items: cases.map((item) => ({ customerKey: item.key, report: { financial: { invoiceTotal: 1000, tripleReconciliationVerified: item.financial, evidence: [{ sourceId: `${item.key}-invoice` }] } } })) });
  return root;
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("APR Infissi · batch preflight persistente", () => {
  it("riconcilia un checkpoint storico solo quando la differenza deriva dal routing documentale", () => {
    const root = fixtureRoot();
    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-08-23T00:00:00Z"));

    const acquisitionPath = path.join(root, "crm-acquisition", "checkpoint.json");
    const acquisition = JSON.parse(readFileSync(acquisitionPath, "utf8"));
    const dossierPath = path.join(root, "crm-acquisition", "dossiers", "persiana.json");
    writeJson(dossierPath, { row: { dati_form: {} } });
    acquisition.items.push({ customerKey: "persiana", displayName: "Caso Persiana", practiceId: "practice-persiana", dossierPath, state: "acquired", productModule: "infissi", responseSha256: "sha-persiana" });
    writeJson(acquisitionPath, acquisition);

    const analysisPath = path.join(root, "crm-document-analysis", "checkpoint.json");
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
    const textPath = path.join(root, "crm-document-analysis", "text", "persiana", "invoice.txt");
    mkdirSync(path.dirname(textPath), { recursive: true });
    writeFileSync(textPath, "Fattura per fornitura e posa di n. 1 persiana in alluminio 120 x 245 cm");
    analysis.items.push({ customerKey: "persiana", documentKey: "persiana-invoice", kind: "invoice", textPath, state: "analyzed" });
    writeJson(analysisPath, analysis);

    const checkpoint = JSON.parse(readFileSync(batch.checkpointPath, "utf8"));
    checkpoint.items.push({ ...checkpoint.items[0], customerKey: "persiana", displayName: "Caso Persiana", practiceId: "practice-persiana", dossierPath });
    checkpoint.progress.total += 1;
    checkpoint.progress.processed += 1;
    checkpoint.progress.ready += 1;
    checkpoint.sourceFingerprint = createHash("sha256").update(JSON.stringify(acquisition.items.map((item: Record<string, unknown>) => [item.customerKey, item.practiceId, item.responseSha256]))).digest("hex");
    writeJson(batch.checkpointPath, checkpoint);

    batch.tick(new Date("2026-08-23T00:01:00Z"));
    expect(batch.snapshot().items.map((item) => item.customerKey)).toEqual(["ready", "blocked"]);
    expect(batch.snapshot().audit.find((event) => event.type === "routing_reconciled")).toMatchObject({
      type: "routing_reconciled",
      appliedRuleIds: expect.arrayContaining(["user-2026-08-23-documented-product-module-over-label"]),
    });
  });

  it("in una coorte mista elabora soltanto gli Infissi e non classifica le Schermature con il gate sbagliato", () => {
    const root = fixtureRoot();
    const acquisitionPath = path.join(root, "crm-acquisition", "checkpoint.json");
    const acquisition = JSON.parse(readFileSync(acquisitionPath, "utf8"));
    acquisition.items[0].productModule = "infissi";
    acquisition.items[1].productModule = "infissi";
    acquisition.items.push({ ...acquisition.items[0], customerKey: "screening", displayName: "Caso Schermatura", practiceId: "practice-screening", productModule: "screening", responseSha256: "sha-screening" });
    acquisition.items.push({ ...acquisition.items[0], customerKey: "persiana-etichettata-infissi", displayName: "Persiana Etichettata Infissi", practiceId: "practice-shutter-mislabeled", productModule: "infissi", responseSha256: "sha-shutter-mislabeled" });
    writeJson(acquisitionPath, acquisition);
    const analysisPath = path.join(root, "crm-document-analysis", "checkpoint.json");
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
    const shutterTextPath = path.join(root, "crm-document-analysis", "text", "persiana-etichettata-infissi", "invoice.txt");
    mkdirSync(path.dirname(shutterTextPath), { recursive: true });
    writeFileSync(shutterTextPath, "FATTURA: fornitura e posa di n. 1 persiana in alluminio 120 x 245 cm");
    analysis.items.push({ customerKey: "persiana-etichettata-infissi", documentKey: "shutter-invoice", kind: "invoice", textPath: shutterTextPath, state: "analyzed" });
    writeJson(analysisPath, analysis);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-08-23T00:00:00Z"));
    expect(batch.snapshot().items.map((item) => item.customerKey)).toEqual(["ready", "blocked"]);
    expect(batch.snapshot().progress.total).toBe(2);
  });

  it("persiste mixed quando le fonti originarie documentano Infissi e avvolgibili", () => {
    const root = fixtureRoot();
    const acquisitionPath = path.join(root, "crm-acquisition", "checkpoint.json");
    const acquisition = JSON.parse(readFileSync(acquisitionPath, "utf8"));
    const dossierPath = path.join(root, "crm-acquisition", "dossiers", "armando-ranzoni.json");
    writeJson(dossierPath, { row: { dati_form: { prodotto: {} } } });
    acquisition.items.push({ customerKey: "armando-ranzoni", displayName: "Armando Ranzoni", practiceId: "practice-armando", dossierPath, state: "acquired", productModule: "infissi", responseSha256: "sha-armando" });
    writeJson(acquisitionPath, acquisition);

    const analysisPath = path.join(root, "crm-document-analysis", "checkpoint.json");
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
    const textPath = path.join(root, "crm-document-analysis", "text", "armando-ranzoni", "invoice.txt");
    mkdirSync(path.dirname(textPath), { recursive: true });
    writeFileSync(textPath, "Fattura per fornitura e posa di n. 1 tapparella in alluminio. Infissi PVC n. 1.");
    analysis.items.push({ customerKey: "armando-ranzoni", documentKey: "armando-invoice", kind: "invoice", textPath, state: "analyzed" });
    writeJson(analysisPath, analysis);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-08-23T00:00:00Z"));
    expect(batch.snapshot().items.find((item) => item.customerKey === "armando-ranzoni"))
      .toMatchObject({ productModule: "mixed" });
  });

  it("migra il routing di un checkpoint storico senza rielaborare il caso", () => {
    const root = fixtureRoot();
    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-08-23T00:00:00Z"));
    batch.tick(new Date("2026-08-23T00:00:10Z"));
    batch.tick(new Date("2026-08-23T00:00:20Z"));
    const checkpoint = batch.snapshot();
    const priorRevision = checkpoint.revision;
    const priorStates = checkpoint.items.map((item) => item.state);
    const historical = {
      ...checkpoint,
      items: checkpoint.items.map(({ productModule: _productModule, ...item }) => item),
    };
    writeJson(batch.checkpointPath, historical);

    const resumed = new PersistentAprInfissiBatchPreflight(root);
    resumed.tick(new Date("2026-08-23T00:01:00Z"));
    expect(resumed.snapshot()).toMatchObject({
      revision: priorRevision + 1,
      items: [
        { customerKey: "ready", productModule: "infissi", state: priorStates[0] },
        { customerKey: "blocked", productModule: "infissi", state: priorStates[1] },
      ],
      audit: expect.arrayContaining([expect.objectContaining({ type: "routing_reconciled" })]),
    });
  });

  it("riprende dopo riavvio, isola il blocker e non perde ne duplica la coda", () => {
    const root = fixtureRoot();
    const first = new PersistentAprInfissiBatchPreflight(root);
    first.tick(new Date("2026-08-19T10:00:00Z"));
    expect(first.snapshot().progress).toEqual({ total: 2, processed: 1, ready: 1, blocked: 0 });

    const restarted = new PersistentAprInfissiBatchPreflight(root);
    restarted.tick(new Date("2026-08-19T10:01:00Z"));
    restarted.tick(new Date("2026-08-19T10:02:00Z"));
    const completed = restarted.snapshot();
    expect(completed).toMatchObject({ status: "completed", currentCustomerKey: null, progress: { total: 2, processed: 2, ready: 1, blocked: 1 } });
    expect(completed.items.map((item) => [item.customerKey, item.state])).toEqual([["ready", "ready_local_plan"], ["blocked", "blocked_case"]]);
    expect(completed.items[1].report?.blockers.map((blocker) => blocker.code)).toContain("infissi_dimensions_and_cardinality_missing");

    restarted.tick(new Date("2026-08-19T10:03:00Z"));
    const afterIdempotentTick = JSON.parse(readFileSync(restarted.checkpointPath, "utf8"));
    expect(afterIdempotentTick.revision).toBe(completed.revision);
    expect(afterIdempotentTick.items).toHaveLength(2);
  });

  it("riapplica una revisione senza perdere audit e senza duplicare la coda", () => {
    const root = fixtureRoot();
    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-08-19T10:00:00Z"));
    batch.tick(new Date("2026-08-19T10:01:00Z"));
    const completed = batch.tick(new Date("2026-08-19T10:02:00Z"));
    const customerKeys = completed.items.map((item) => item.customerKey);

    const revised = batch.applyValidationRevision("infissi-financial-layout-v1", new Date("2026-08-19T10:03:00Z"));
    expect(revised).toMatchObject({
      status: "working",
      progress: { total: customerKeys.length, processed: 0 },
      validationRevisionsApplied: ["infissi-financial-layout-v1"],
    });
    expect(revised.items.map((item) => item.customerKey)).toEqual(customerKeys);
    expect(revised.audit.at(-1)?.type).toBe("validation_requeued");
    expect(batch.applyValidationRevision("infissi-financial-layout-v1", new Date("2026-08-19T10:04:00Z")).revision).toBe(revised.revision);
  });

  it("non perde un blocker economico del preflight comune anche se il payload tecnico e completo", () => {
    const root = fixtureRoot();
    const commonPath = path.join(root, "crm-local-preflight", "checkpoint.json");
    const common = JSON.parse(readFileSync(commonPath, "utf8"));
    common.items[0].report.blockers = [{
      code: "bank_transfer_invoice_cross_check_failed",
      field: "economic_sources.bankTransfers",
      sourceIds: ["bonifico-incompleto"],
      appliedRuleIds: ["user-2026-08-18-mandatory-bank-transfer-invoice-expense-cross-check"],
    }];
    writeJson(commonPath, common);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-08-19T10:00:00Z"));
    expect(batch.snapshot().items[0]).toMatchObject({
      state: "blocked_case",
      report: {
        physicalProductCount: 1,
        blockers: [{ code: "bank_transfer_invoice_cross_check_failed", field: "economic_sources.bankTransfers" }],
      },
    });
    expect(batch.snapshot().audit.at(-1)?.appliedRuleIds).toContain("user-2026-08-18-mandatory-bank-transfer-invoice-expense-cross-check");
  });

  it("applica in modo generale la fattura sopra il form per vetro vecchio e trasmittanza", () => {
    const root = fixtureRoot();
    const analysisPath = path.join(root, "crm-document-analysis", "checkpoint.json");
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
    const ready = analysis.items.find((item: { customerKey: string }) => item.customerKey === "ready");
    ready.kind = "invoice";
    writeFileSync(ready.textPath, "Serramenti smontati in legno\ndoppio vetro\nFinestra dimensioni: 1000 x 1200, Pezzi: 1, Trasmittanza termica 1,2 W/m2K");
    writeJson(analysisPath, analysis);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-08-22T10:00:00Z"));
    const item = batch.snapshot().items.find((candidate) => candidate.customerKey === "ready");

    expect(item).toMatchObject({
      state: "ready_local_plan",
      report: {
        productRules: { oldWindowThermalTransmittanceWm2K: 3 },
        oldWindowSourceResolution: {
          material: "legno",
          glazing: "doppio",
          sourceKind: "invoice_over_form",
          sourceIds: ["ready-doc", "practice-ready:crm-form"],
        },
        eneaDraftPayload: { windows: [{ oldWindowThermalTransmittanceWm2K: 3 }] },
      },
    });
  });
});
