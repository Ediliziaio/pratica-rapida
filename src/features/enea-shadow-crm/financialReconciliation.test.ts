import { describe, expect, it } from "vitest";
import { reconcileFinancialEvidence, type FinancialDocumentEvidence } from "./financialReconciliation";
import { applyTripleFinancialReconciliationGate, canAdvanceFromPreflightToEnea, canConfirmAndSubmitEnea, EMPTY_SHADOW_CRM_STATE, recordEneaDescriptionPreviewConfirmed, recordEneaDescriptionPreviewOpened, recordEneaPreflightRun } from "./workflow";
import { ENEA_PREFLIGHT_STEPS, runEneaPreflight } from "./preflightContract";
import { ENEA_OPERATIONAL_REGISTRY_VERSION } from "./operationalRegistry";

const doc = (patch: Partial<FinancialDocumentEvidence> = {}): FinancialDocumentEvidence => ({
  sourceId: "fattura-1", supplierId: "fornitore-demo", documentNumber: "209", documentDate: "2026-06-09",
  kind: "invoice", taxableAmount: 100, vatAmount: 22, grossTotal: 122, referencedAdvanceIds: [],
  interventionGrossAmount: 122, extractionConfidence: "certain", ...patch,
});

describe("riconciliazione finanziaria tripla", () => {
  it("riconcilia acconto e saldo senza perdere o duplicare l'acconto", () => {
    const result = reconcileFinancialEvidence([
      doc({ sourceId: "acconto", kind: "advance", taxableAmount: 381.15, vatAmount: 83.85, grossTotal: 465, interventionGrossAmount: 465 }),
      doc({ sourceId: "saldo", documentNumber: "282", kind: "balance", taxableAmount: 971.31, vatAmount: 213.69, grossTotal: 1185, referencedAdvanceIds: ["acconto"], interventionGrossAmount: 1185 }),
    ]);
    expect(result).toMatchObject({ usable: true, total: 1650 });
    expect(applyTripleFinancialReconciliationGate(EMPTY_SHADOW_CRM_STATE, result).audit.at(-1)?.type).toBe("financial-triple-reconciled");
  });

  it("scarta duplicati con stessa terna numero data totale e li conserva nell'audit", () => {
    const result = reconcileFinancialEvidence([doc(), doc({ sourceId: "copia" })]);
    expect(result).toMatchObject({ usable: true, total: 122, candidateInvoiceSourceIds: ["fattura-1"], discardedDuplicateSourceIds: ["copia"] });
    const gated = applyTripleFinancialReconciliationGate(EMPTY_SHADOW_CRM_STATE, result);
    expect(gated.audit.map((event) => event.type)).toContain("financial-duplicate-discarded:copia");
  });

  it("deduplica Agostinelli in due fatture candidate e ignora la planimetria non economica", () => {
    const result = reconcileFinancialEvidence([
      doc({ sourceId: "fattura-76", documentNumber: "76", documentDate: "2026-01-10", taxableAmount: 4836.07, vatAmount: 1063.94, grossTotal: 5900.01, interventionGrossAmount: 5900.01 }),
      doc({ sourceId: "fattura-76-copia", documentNumber: "76", documentDate: "2026-01-10", taxableAmount: 4836.07, vatAmount: 1063.94, grossTotal: 5900.01, interventionGrossAmount: 5900.01 }),
      doc({ sourceId: "fattura-78", documentNumber: "78", documentDate: "2026-02-10", taxableAmount: 17213.11, vatAmount: 3786.89, grossTotal: 21000, interventionGrossAmount: 21000 }),
      doc({ sourceId: "fattura-78-copia", documentNumber: "78", documentDate: "2026-02-10", taxableAmount: 17213.11, vatAmount: 3786.89, grossTotal: 21000, interventionGrossAmount: 21000 }),
      doc({ sourceId: "planimetria", kind: "non_economic", documentNumber: "", documentDate: "", taxableAmount: null, vatAmount: null, grossTotal: null, interventionGrossAmount: null }),
    ]);
    expect(result).toMatchObject({
      usable: true, total: 26900.01,
      candidateInvoiceSourceIds: ["fattura-76", "fattura-78"],
      discardedDuplicateSourceIds: ["fattura-76-copia", "fattura-78-copia"],
      nonEconomicSourceIds: ["planimetria"],
    });
  });

  it("blocca fail-closed una fonte dichiarata fattura senza terna completa", () => {
    const result = reconcileFinancialEvidence([doc({ documentNumber: "" })]);
    expect(result.usable).toBe(false);
    expect(result.blockers).toContain("terna-fattura-incerta:fattura-1");
  });

  it("usa i lordi delle fatture Matteo e audita lo storno interno difforme senza bloccare", () => {
    const result = reconcileFinancialEvidence([
      doc({ sourceId: "acconto-490", documentNumber: "490/26", documentDate: "2026-05-26", kind: "advance", taxableAmount: 2545.45, vatAmount: 254.55, grossTotal: 2800, interventionGrossAmount: 2800 }),
      doc({ sourceId: "acconto-490-copia", documentNumber: "490/26", documentDate: "2026-05-26", kind: "advance", taxableAmount: 2545.45, vatAmount: 254.55, grossTotal: 2800, interventionGrossAmount: 2800 }),
      doc({ sourceId: "saldo-814", documentNumber: "814/26", documentDate: "2026-07-23", kind: "balance", taxableAmount: 5954.55, vatAmount: 595.46, grossTotal: 6550.01, interventionGrossAmount: 6550.01, referencedAdvanceIds: ["acconto-490"], internalAdjustmentNote: "Storno interno lordo €2.900 difforme dall'acconto €2.800; non incide sul totale ENEA." }),
      doc({ sourceId: "saldo-814-copia", documentNumber: "814/26", documentDate: "2026-07-23", kind: "balance", taxableAmount: 5954.55, vatAmount: 595.46, grossTotal: 6550.01, interventionGrossAmount: 6550.01 }),
    ]);
    expect(result).toMatchObject({ usable: true, total: 9350.01, candidateInvoiceSourceIds: ["acconto-490", "saldo-814"], discardedDuplicateSourceIds: ["acconto-490-copia", "saldo-814-copia"] });
    expect(result.auditNotes[0]).toContain("Storno interno lordo");
    const state = applyTripleFinancialReconciliationGate(EMPTY_SHADOW_CRM_STATE, result);
    expect(state.audit.map((event) => event.type).some((type) => type.startsWith("financial-internal-adjustment-noted:"))).toBe(true);
  });

  it("mantiene bloccanti duplicati ambigui e tripla verifica non concorde", () => {
    expect(reconcileFinancialEvidence([doc({ documentNumber: "" })]).usable).toBe(false);
    expect(reconcileFinancialEvidence([doc({ interventionGrossAmount: 121 })]).blockers).toContain("totali-metodi-non-coincidenti");
  });

  it("blocca mismatch imponibile IVA e totale", () => {
    expect(reconcileFinancialEvidence([doc({ grossTotal: 130 })]).blockers).toContain("imponibile-iva-mismatch:fattura-1");
  });

  it("blocca estrazione OCR incerta", () => {
    expect(reconcileFinancialEvidence([doc({ extractionConfidence: "uncertain" })]).blockers).toContain("estrazione-incerta:fattura-1");
  });

  it("blocca quando il totale ENEA non è dimostrabile dalle righe intervento", () => {
    const result = reconcileFinancialEvidence([doc({ interventionGrossAmount: null })]);
    const state = applyTripleFinancialReconciliationGate(EMPTY_SHADOW_CRM_STATE, result, new Date("2026-08-13T18:00:00Z"));
    expect(state.operatorStatus).toBe("requested_operator");
    expect(state.exceptions[0]).toMatchObject({ field: "economico.riconciliazione_tripla" });
  });

  it("resta fail-closed verso ENEA se la tripla verifica manca o fallisce", () => {
    const previewed = recordEneaDescriptionPreviewConfirmed(recordEneaDescriptionPreviewOpened(EMPTY_SHADOW_CRM_STATE));
    expect(canAdvanceFromPreflightToEnea(previewed)).toBe(false);
    expect(canConfirmAndSubmitEnea(previewed)).toBe(false);
    const failed = applyTripleFinancialReconciliationGate(previewed, reconcileFinancialEvidence([doc({ extractionConfidence: "uncertain" })]));
    expect(canAdvanceFromPreflightToEnea(failed)).toBe(false);
  });

  it("non abilita il percorso ENEA con la sola tripla verifica", () => {
    const reconciled = applyTripleFinancialReconciliationGate(EMPTY_SHADOW_CRM_STATE, reconcileFinancialEvidence([doc()]));
    expect(canAdvanceFromPreflightToEnea(reconciled)).toBe(false);
    const evidence=Object.fromEntries(ENEA_PREFLIGHT_STEPS.map(step=>[step,{source:"fonti originarie",ruleVersion:ENEA_OPERATIONAL_REGISTRY_VERSION,reason:"ok",nextAction:"prosegui"}])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
    const run=runEneaPreflight({sessionReady:true,customerFormAcquired:true,attachmentInventoryComplete:true,requiredAssetsAcquired:true,economicSourcesClassified:true,identityPropertyComplete:true,datesComplete:true,financialTripleReconciled:true,screeningsReconciled:true,plantComplete:true,eneaMappingComplete:true,evidence});
    const ready=recordEneaPreflightRun(reconciled,run);
    expect(canAdvanceFromPreflightToEnea(ready)).toBe(true);
    const previewed = recordEneaDescriptionPreviewConfirmed(recordEneaDescriptionPreviewOpened(ready));
    expect(canConfirmAndSubmitEnea(previewed)).toBe(true);
  });
});
