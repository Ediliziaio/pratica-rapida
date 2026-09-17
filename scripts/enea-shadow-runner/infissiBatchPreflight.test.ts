import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentAprInfissiBatchPreflight, infissiCertificateMeasureFallback } from "./infissiBatchPreflight";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID, PersistentAprOperatorResponseLedger } from "./operatorResponseLedger";
import { buildAprAuthoritativeEconomicDecision } from "../../src/features/enea-shadow-crm/authoritativeEconomicDecision";
import { reconcileFinancialEvidence, type FinancialDocumentEvidence } from "../../src/features/enea-shadow-crm/financialReconciliation";

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
    return { customerKey: item.key, documentKey: `${item.key}-doc`, kind: "invoice", textPath, state: "analyzed" };
  });
  writeJson(path.join(root, "crm-acquisition", "checkpoint.json"), { status: "completed", items: acquisitionItems });
  writeJson(path.join(root, "crm-original-documents", "checkpoint.json"), {
    status: "completed",
    items: cases.map((item) => ({
      customerKey: item.key,
      documentKey: `${item.key}-doc`,
      kind: "invoice",
      state: "downloaded",
      localPath: path.join(root, "crm-original-documents", "files", item.key, `${item.key}-doc.pdf`),
    })),
  });
  writeJson(path.join(root, "crm-document-analysis", "checkpoint.json"), { status: "completed", items: analysisItems });
  writeJson(path.join(root, "crm-local-preflight", "checkpoint.json"), { status: "completed", items: cases.map((item) => {
    const evidence: FinancialDocumentEvidence = { sourceId: `${item.key}-doc:invoice:fixture`, supplierId: "supplier", documentNumber: "1", documentDate: "2026-01-01", kind: "invoice", taxableAmount: null, vatAmount: null, grossTotal: item.financial ? 1000 : null, referencedAdvanceIds: [], interventionGrossAmount: item.financial ? 1000 : null, extractionConfidence: item.financial ? "certain" : "uncertain", extractionIssues: [] };
    const reconciliation = reconcileFinancialEvidence([evidence]);
    return { customerKey: item.key, report: { blockers: [], financial: { invoiceTotal: 1000, eligibleExpense: 1000, finalPrintedTotalVerified: item.financial, tripleReconciliationVerified: item.financial, authoritativeDecision: buildAprAuthoritativeEconomicDecision({ reconciliation, eligibleExpense: item.financial ? 1000 : null }), evidence: [{ sourceId: evidence.sourceId, kind: "invoice", extractionConfidence: evidence.extractionConfidence, extractionIssues: [] }] } } };
  }) });
  return root;
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("APR Infissi · batch preflight persistente", () => {
  it("APR Infissi: rifiuta un totale legacy privo della decisione economica canonica", () => {
    const root = fixtureRoot();
    const commonPath = path.join(root, "crm-local-preflight", "checkpoint.json");
    const common = JSON.parse(readFileSync(commonPath, "utf8"));
    delete common.items[0].report.financial.authoritativeDecision;
    writeJson(commonPath, common);
    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-09-12T01:00:00Z"));
    expect(batch.snapshot().items[0]).toMatchObject({
      state: "blocked_case",
      report: { blockers: expect.arrayContaining([expect.objectContaining({ code: "infissi_authoritative_economic_decision_required" })]) },
    });
  });
  it("consuma dal registro condiviso la risposta sull'infisso vecchio e ne persiste la ricevuta runtime", () => {
    const root = fixtureRoot();
    const ledger = new PersistentAprOperatorResponseLedger(root);
    ledger.importResponses([{
      responseId: "response:ready:old-window:20260911",
      customerKey: "ready",
      displayName: "Caso Ready",
      practiceId: "practice-ready",
      receivedAt: "2026-09-11T08:00:00.000Z",
      source: "giuliano_chat_decision",
      question: "Quali sono materiale e vetro dei vecchi infissi?",
      answer: "Metallo e vetro doppio.",
      payload: { kind: "old_window_characteristics", material: "metal", glazing: "double", appliesToCount: 1 },
      status: "active",
      supersedesResponseId: null,
      appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID],
    }]);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-09-11T08:05:00.000Z"));
    expect(batch.snapshot().items[0].report?.oldWindowSourceResolution).toMatchObject({ material: "metallo", glazing: "vetro_doppio" });
    expect(ledger.load().applications).toContainEqual(expect.objectContaining({
      responseId: "response:ready:old-window:20260911",
      outcome: "applied",
      evidence: "dossier_override:old_window_characteristics",
    }));
  });

  it("regressione Stricelli end-to-end: il fascicolo fatture completo e silente sovrascrive il SI del form con NO", () => {
    const root = fixtureRoot();
    const acquisitionPath = path.join(root, "crm-acquisition", "checkpoint.json");
    const acquisition = JSON.parse(readFileSync(acquisitionPath, "utf8"));
    const readyDossier = JSON.parse(readFileSync(acquisition.items[0].dossierPath, "utf8"));
    readyDossier.row.dati_form.prodotto.zanzariere_tapparelle_persiane = true;
    writeJson(acquisition.items[0].dossierPath, readyDossier);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-09-10T22:00:00Z"));
    expect(batch.snapshot().items[0]).toMatchObject({
      state: "ready_local_plan",
      report: {
        productRules: { status: "ready", eneaShadingClosuresChecked: false, audit: { shadingClosuresSource: "invoice_authoritative" } },
        shadingClosureAllocation: { mode: "invoice_none", flags: [false], blocker: null, audit: { ignoredFormAlsoInstalledClosures: true } },
        eneaDraftPayload: { windows: [{ shadingClosuresChecked: false }] },
      },
    });
    expect(batch.snapshot().items[0].report?.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiInvoiceAuthoritativeShadingClosures);
  });

  it("non interpreta il silenzio come NO quando una fattura inventariata non e stata scaricata", () => {
    const root = fixtureRoot();
    const documentsPath = path.join(root, "crm-original-documents", "checkpoint.json");
    const documents = JSON.parse(readFileSync(documentsPath, "utf8"));
    documents.items.find((item: { customerKey: string }) => item.customerKey === "ready").state = "blocked_response";
    writeJson(documentsPath, documents);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-09-10T22:00:00Z"));
    expect(batch.snapshot().items[0]).toMatchObject({
      state: "blocked_case",
      report: { blockers: [{ code: "infissi_invoice_evidence_incomplete_for_shading_closure_resolution" }] },
    });
  });

  it("risolve le chiusure prima delle domande anche se la confidence economica e incerta", () => {
    const root = fixtureRoot();
    const acquisitionPath = path.join(root, "crm-acquisition", "checkpoint.json");
    const acquisition = JSON.parse(readFileSync(acquisitionPath, "utf8"));
    const readyDossier = JSON.parse(readFileSync(acquisition.items[0].dossierPath, "utf8"));
    readyDossier.row.dati_form.prodotto.zanzariere_tapparelle_persiane = true;
    writeJson(acquisition.items[0].dossierPath, readyDossier);
    const commonPath = path.join(root, "crm-local-preflight", "checkpoint.json");
    const common = JSON.parse(readFileSync(commonPath, "utf8"));
    common.items[0].report.financial.evidence[0].extractionConfidence = "uncertain";
    writeJson(commonPath, common);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-09-11T10:00:00Z"));
    expect(batch.snapshot().items[0]).toMatchObject({
      state: "ready_local_plan",
      report: {
        blockers: [],
        shadingClosureAllocation: { mode: "invoice_none", flags: [false], blocker: null },
        productRules: { status: "ready", eneaShadingClosuresChecked: false },
      },
    });
  });

  it("non elabora nel modulo Infissi una pratica già esclusa permanentemente dal preflight comune", () => {
    const root = fixtureRoot();
    const commonPath = path.join(root, "crm-local-preflight", "checkpoint.json");
    const common = JSON.parse(readFileSync(commonPath, "utf8"));
    common.items[0].report.blockers = [{
      code: "permanent_customer_automation_exclusion",
      field: "practice",
      sourceIds: ["customerKey:ready"],
      appliedRuleIds: ["user-2026-08-18-future-test-exclusions"],
    }];
    writeJson(commonPath, common);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-09-04T00:00:00Z"));
    const snapshot = batch.snapshot();
    expect(snapshot.items.map((item) => item.customerKey)).toEqual(["blocked"]);
    expect(snapshot.items.some((item) => item.customerKey === "ready")).toBe(false);
  });

  it("riconcilia un checkpoint storico solo con migrate esplicito", () => {
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

    const beforeResume = readFileSync(batch.checkpointPath, "utf8");
    batch.reconcileDocumentedProductRouting("resume", new Date("2026-08-23T00:01:00Z"));
    expect(readFileSync(batch.checkpointPath, "utf8")).toBe(beforeResume);
    expect(batch.snapshot().items.map((item) => item.customerKey)).toEqual(["ready", "blocked", "persiana"]);

    batch.reconcileDocumentedProductRouting("migrate", new Date("2026-08-23T00:02:00Z"));
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

  it("non migra il routing storico su resume e lo persiste solo su migrate", () => {
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
    const checkpointBytesBeforeResume = readFileSync(batch.checkpointPath, "utf8");
    resumed.tick(new Date("2026-08-23T00:01:00Z"));
    expect(readFileSync(batch.checkpointPath, "utf8")).toBe(checkpointBytesBeforeResume);
    expect(resumed.snapshot()).toMatchObject({
      revision: priorRevision,
      items: [
        { customerKey: "ready", state: priorStates[0] },
        { customerKey: "blocked", state: priorStates[1] },
      ],
    });
    expect(resumed.snapshot().items.every((item) => item.productModule === undefined)).toBe(true);
    expect(resumed.snapshot().audit.some((event) => event.type === "routing_reconciled")).toBe(false);

    resumed.reconcileDocumentedProductRouting("migrate", new Date("2026-08-23T00:02:00Z"));
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

  it("consulta i certificati additional prima di dichiarare mancanti misure e cardinalita", () => {
    const root = fixtureRoot();
    const analysisPath = path.join(root, "crm-document-analysis", "checkpoint.json");
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
    const certificatePath = path.join(root, "crm-document-analysis", "text", "blocked", "dop.txt");
    mkdirSync(path.dirname(certificatePath), { recursive: true });
    writeFileSync(certificatePath, `DICHIARAZIONE DI PRESTAZIONE\nPos. 1 Q.tà 1 Finestra due ante\nda 1200 x 1500 mm.\nLuce passaggio: 1100 x 1400`);
    analysis.items.push({
      customerKey: "blocked",
      documentKey: "blocked-dop",
      kind: "additional",
      semanticKind: "third_party_certificate",
      textPath: certificatePath,
      state: "analyzed",
    });
    writeJson(analysisPath, analysis);
    const originalsPath = path.join(root, "crm-original-documents", "checkpoint.json");
    const originals = JSON.parse(readFileSync(originalsPath, "utf8"));
    originals.items.push({ customerKey: "blocked", documentKey: "blocked-dop", kind: "additional", state: "downloaded" });
    writeJson(originalsPath, originals);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-09-13T20:00:00Z"));
    batch.tick(new Date("2026-09-13T20:01:00Z"));
    const item = batch.snapshot().items.find((candidate) => candidate.customerKey === "blocked");
    expect(item).toMatchObject({
      state: "ready_local_plan",
      report: {
        blockers: [],
        physicalProductCount: 1,
        automaticTechnicalEvidenceAudit: { selectedParser: "certificate-measures:dop_pos_quantita", selectedSourceId: "blocked-dop" },
        technical: { rows: [{ sourceLineId: expect.stringContaining("blocked-dop:line:2:position:1:piece:1"), exactAreaM2: 1.8 }] },
        eneaDraftPayload: { windows: [{ areaM2: 1.8 }] },
      },
    });
  });

  it("non inventa quote complessive quando una posizione certificata e composta", () => {
    const root = fixtureRoot();
    const analysisPath = path.join(root, "crm-document-analysis", "checkpoint.json");
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
    const certificatePath = path.join(root, "crm-document-analysis", "text", "blocked", "dop-composita.txt");
    mkdirSync(path.dirname(certificatePath), { recursive: true });
    writeFileSync(certificatePath, `DICHIARAZIONE DI PRESTAZIONE\nWEB/26/0103175 - 001\n1625 x 780\n680 x 684`);
    analysis.items.push({ customerKey: "blocked", documentKey: "blocked-dop-composita", kind: "additional", semanticKind: "third_party_certificate", textPath: certificatePath, state: "analyzed" });
    writeJson(analysisPath, analysis);
    const originalsPath = path.join(root, "crm-original-documents", "checkpoint.json");
    const originals = JSON.parse(readFileSync(originalsPath, "utf8"));
    originals.items.push({ customerKey: "blocked", documentKey: "blocked-dop-composita", kind: "additional", state: "downloaded" });
    writeJson(originalsPath, originals);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-09-13T20:00:00Z"));
    batch.tick(new Date("2026-09-13T20:01:00Z"));
    const item = batch.snapshot().items.find((candidate) => candidate.customerKey === "blocked");
    expect(item?.report?.technical.rows).toEqual([expect.objectContaining({ exactAreaM2: 1.73 })]);
    expect(item?.report?.technical.rows[0]).not.toHaveProperty("widthM");
    expect(item?.report?.technical.rows[0]).not.toHaveProperty("heightM");
    expect(item?.report?.eneaDraftPayload?.windows).toEqual([expect.objectContaining({ areaM2: 1.7 })]);
    expect(item?.report?.eneaDraftPayload?.windows[0]).not.toHaveProperty("widthM");
    expect(item?.report?.eneaDraftPayload?.windows[0]).not.toHaveProperty("heightM");
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

  it("non propaga come blocker un vecchio controllo bonifico sospeso", () => {
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
      state: "ready_local_plan",
      report: { physicalProductCount: 1, blockers: [] },
    });
    expect(batch.snapshot().items[0].report?.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalRuntimeAuthority);
  });

  it("Ranzoni: advance e balance valgono entrambe come evidenza fiscale completa", () => {
    const root = fixtureRoot();
    const commonPath = path.join(root, "crm-local-preflight", "checkpoint.json");
    const common = JSON.parse(readFileSync(commonPath, "utf8"));
    common.items[0].report.financial.finalPrintedTotalVerified = true;
    common.items[0].report.financial.evidence = [
      { sourceId: "ready-doc:invoice:advance", kind: "advance", grossTotal: 3_446.50, extractionConfidence: "certain", extractionIssues: [] },
      { sourceId: "ready-doc:invoice:balance", kind: "balance", grossTotal: 3_446.50, extractionConfidence: "certain", extractionIssues: [] },
    ];
    writeJson(commonPath, common);

    const batch = new PersistentAprInfissiBatchPreflight(root);
    batch.tick(new Date("2026-09-11T09:00:00Z"));
    expect(batch.snapshot().items[0]).toMatchObject({ state: "ready_local_plan", report: { blockers: [] } });
    expect(batch.snapshot().items[0].report?.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.advanceBalanceFiscalInvoiceEquivalence);
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

describe("infissiCertificateMeasureFallback", () => {
  const cappello = [
    "DICHIARAZIONE DEL PRODUTTORE",
    "Le caratteristiche dei nuovi serramenti di cui alla conferma 6653221 datata 24.04.2026 di Rotondi Infissi Srl",
    "Pos. Quantitá Descrizione Valore Uw (calcolato)",
    "100 1,00 Pezzi SALOTTO SX:",
    "KF310 1-anta",
    "Largh.: 1177, Alt.: 1497,",
    "110 1,00 Pezzi CAMERA EMANUELE:",
    "Largh.: 1177, Alt.: 1497,",
  ].join("\n");

  // Massimo Cappello, 13/09/2026: la dichiarazione era nello slot fattura del
  // CRM e veniva saltata; le dodici misure erano li' e la pratica si fermava
  // su misure mancanti.
  it("legge una dichiarazione del produttore anche se il CRM l'ha caricata nello slot fattura", () => {
    const result = infissiCertificateMeasureFallback([
      { sourceId: "dop-rotondi", storageKind: "invoice", kind: "additional", text: cappello },
    ]);
    expect(result).not.toBeNull();
    expect(result!.reading.pieces).toHaveLength(2);
    expect(result!.evidence.rows.map((row) => row.surfaceM2)).toEqual([1.76, 1.76]);
  });

  it("una fattura vera nello slot fattura non viene letta come certificato", () => {
    expect(infissiCertificateMeasureFallback([
      { sourceId: "fattura", storageKind: "invoice", kind: "invoice", text: "Fattura n. 12 del 01/05/2026\nFornitura infissi PVC\nTotale documento 4.500,00" },
    ])).toBeNull();
  });

  it("un allegato non dichiarativo nello slot additional resta escluso", () => {
    expect(infissiCertificateMeasureFallback([
      { sourceId: "manuale", storageKind: "additional", kind: "additional", text: "Manuali allegati alla fornitura. Leggere e conservare." },
    ])).toBeNull();
  });
});
