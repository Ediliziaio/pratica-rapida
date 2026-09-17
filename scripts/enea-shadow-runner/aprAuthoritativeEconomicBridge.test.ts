import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAprAuthoritativeEconomicDecision } from "../../src/features/enea-shadow-crm/authoritativeEconomicDecision";
import { reconcileFinancialEvidence, type FinancialDocumentEvidence } from "../../src/features/enea-shadow-crm/financialReconciliation";
import { loadAuthoritativeEconomicDecisionForBridge } from "./aprAuthoritativeEconomicBridge";
import { mapBusinessDecisionArtifactToEnea } from "./aprEneaPureMapper";

const roots: string[] = [];
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
function writeJson(target: string, value: unknown) { mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
const invoice = (sourceId: string, grossTotal: number | null): FinancialDocumentEvidence => ({
  sourceId, supplierId: "supplier", supplierName: "Supplier", documentNumber: "1/2026", documentDate: "2026-06-01",
  kind: "invoice", taxableAmount: null, vatAmount: null, grossTotal, referencedAdvanceIds: [], interventionGrossAmount: grossTotal,
  extractionConfidence: grossTotal === null ? "uncertain" : "certain", extractionIssues: [],
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-authoritative-economic-")); roots.push(root);
  const customerKey = "cliente-autorevole"; const practiceId = "practice-authoritative-1";
  const dossierPath = path.join(root, "crm-acquisition/dossiers/case.json");
  const textPath = path.join(root, "crm-document-analysis/text/invoice.txt");
  const invoiceText = "FATTURA 1/2026\nTotale documento 915,00 EUR";
  mkdirSync(path.dirname(textPath), { recursive: true }); writeFileSync(textPath, invoiceText, "utf8");
  writeJson(dossierPath, { row: { id: practiceId } });
  writeJson(path.join(root, "crm-acquisition/checkpoint.json"), { status: "completed", items: [{ customerKey, expectedPracticeId: practiceId, practiceId, dossierPath, responseSha256: sha256("crm"), state: "acquired" }] });
  writeJson(path.join(root, "crm-document-analysis/checkpoint.json"), { status: "completed", items: [{ documentKey: "invoice-1", customerKey, kind: "invoice", state: "analyzed", textPath, textSha256: sha256(invoiceText), sourceSha256: sha256("source"), extractionMode: "native_text", nonFiscalImageExcluded: false, invoiceResult: { documentType: "invoice" } }] });
  const reconciliation = reconcileFinancialEvidence([invoice("invoice-1", 915)]);
  const authoritativeDecision = buildAprAuthoritativeEconomicDecision({ reconciliation, eligibleExpense: 915 });
  const checkpointPath = path.join(root, "crm-local-preflight/checkpoint.json");
  writeJson(checkpointPath, { status: "completed", items: [{ customerKey, practiceId, state: "ready_local_plan", report: { outcome: "ready_local_plan", financial: { authoritativeDecision } } }] });
  return { root, customerKey, practiceId, textPath, checkpointPath };
}

afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("bridge economico autorevole", () => {
  it("decisione economica autorevole: costruisce e verifica un solo artefatto persistibile", () => {
    const reconciliation = reconcileFinancialEvidence([invoice("invoice-a", 500), invoice("invoice-b", null)]);
    const decision = buildAprAuthoritativeEconomicDecision({ reconciliation, eligibleExpense: 500 });
    expect(decision).toMatchObject({ status: "resolved", invoiceTotal: 500, eligibleExpense: 500, ignoredIncompleteEconomicSourceIds: ["invoice-b"] });
    expect(decision.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("bridge economico autorevole: consuma il totale del preflight senza riaprire o ricalcolare le fatture", () => {
    const value = fixture();
    writeFileSync(value.textPath, "RICEVUTA BONIFICO\nFattura N. 99\nTotale operazione 99.999,00", "utf8");
    const loaded = loadAuthoritativeEconomicDecisionForBridge(value.root, value.customerKey);
    const mapped = mapBusinessDecisionArtifactToEnea(loaded.decisionsArtifact);
    expect(loaded.decision.eligibleExpense).toBe(915);
    expect(mapped.payload.portalFields).toContainEqual(expect.objectContaining({ fieldId: "calcolo.spesa_ammissibile_lorda_iva_inclusa", value: 915 }));
  });

  it("bridge economico autorevole: una ricevuta bancaria con riferimenti fiscali non viene mai ricostruita come fattura", () => {
    const value = fixture();
    writeFileSync(value.textPath, "OGGETTO: Ricevuta Pagamento Bonifico\nFattura N. 260\nTotale operazione 4.090,00", "utf8");
    expect(loadAuthoritativeEconomicDecisionForBridge(value.root, value.customerKey).decision.invoiceTotal).toBe(915);
  });

  it("bridge economico autorevole: rifiuta decisione mancante alterata o riferita a un'altra pratica", () => {
    const value = fixture();
    const checkpoint = JSON.parse(readFileSync(value.checkpointPath, "utf8"));
    checkpoint.items[0].report.financial.authoritativeDecision.eligibleExpense = 999;
    writeJson(value.checkpointPath, checkpoint);
    expect(() => loadAuthoritativeEconomicDecisionForBridge(value.root, value.customerKey)).toThrow("apr_authoritative_economic_decision_unavailable");
  });
});

