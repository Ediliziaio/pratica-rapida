import { combineDocumentResults } from "../../src/features/enea-lab/invoiceParser";
import { existsSync, readFileSync } from "node:fs";
import { mapSchermaturaPractice } from "../../src/features/enea-lab/mapper";
import { buildEneaPayload, fingerprintPreparedPractice, validatePreparedPractice } from "../../src/features/enea-lab/preparation";
import { mapQueueRow } from "../../src/features/enea-lab/readOnlySource";
import { prepareEneaTestDraftPortalCollaudo, type EneaTestDraftPortalGate } from "../../src/features/enea-lab/testDraftPortalGate";
import type { EneaLabDocumentAnalysis, EneaLabIssue, EneaLabMappedPractice, EneaLabPayload, EneaLabSourcePractice } from "../../src/features/enea-lab/types";
import type { SchermaturaDirezione, SchermaturaItem, SchermaturaTipo } from "../../src/types/form-cliente";
import type { AprCrmDocumentAnalysisState } from "./crmDocumentAnalysis";
import { reconcileLocalInvoiceSegments, splitLocalInvoiceText } from "./localInvoiceSegmentation";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { extractBankTransferEvidences } from "./bankTransferEvidence";
import { ENEA_INTERVENTION_SCOPE } from "../../src/features/enea-lab/interventionRules";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const screeningType = (value: string): SchermaturaTipo => (["tende_da_sole", "pergotenda", "pergola", "altro"] as string[]).includes(value) ? value as SchermaturaTipo : "altro";
const screeningDirection = (value: string): SchermaturaDirezione | "" => (["sud", "sud_est", "sud_ovest", "est", "ovest"] as string[]).includes(value) ? value as SchermaturaDirezione : "";
const COMPOSITE_INVOICE_BANK_TRANSFER_RULE_ID = "system-composite-invoice-bank-transfer-page-segmentation";
const FISCAL_DOCUMENT_MARKERS = /\b(?:totale\s+(?:documento|fattura|imponibile|iva)|riepilogo\s+iva|calcolo\s+fattura|imponibile\s+(?:iva|aliquota))\b/i;

export interface CrmEneaPayloadAuditProduct {
  description: string;
  widthMm?: number;
  heightMm?: number;
  surfaceM2?: number;
  sourceDocumentKey?: string;
  declaredType: string | null;
  exposure: string | null;
  exposureSource?: "paper_form_explicit" | "linea_sole_potito_fallback" | null;
  protectedWindowSurfaceM2?: number | null;
  protectedWindowSurfaceSource?: "paper_form_explicit" | "linea_sole_potito_fallback" | "derived_product_surface" | null;
  supplementaryThermalResistance?: number | null;
  gTot: number;
  gTotSource: "invoice_explicit" | "authorized_fallback";
  material: string;
  materialSource?: "invoice_explicit" | "authorized_fallback";
  movement: string;
  movementSource?: "invoice_explicit" | "authorized_fallback";
  appliedRuleIds: string[];
}

export interface CrmEneaPayloadAuditInput {
  customerKey: string;
  dossierValue: unknown;
  resolvedTaxCode?: string | null;
  resolvedPrimaryBeneficiary?: { name: string; surname: string; taxCode: string; birthDate?: string | null; sex?: "M" | "F" } | null;
  resolvedPrimaryBeneficiarySourceIds?: string[];
  resolvedWorksMunicipality?: { comune: string; provincia: string } | null;
  resolvedWorksMunicipalitySourceIds?: string[];
  startDate?: string | null;
  startDateSource?: string | null;
  completionDate: string | null;
  products: CrmEneaPayloadAuditProduct[];
  financialVerified: boolean;
  reconciledTotal: number | null;
  resolvedBuildingUnitCount?: number | null;
  resolvedBuildingQualification?: "single_unit" | "multi_unit" | null;
  resolvedCoBeneficiaryPresent?: boolean | null;
  resolvedCoBeneficiary?: { name: string; surname: string; taxCode: string; sourceIds: string[] } | null;
  analysis: AprCrmDocumentAnalysisState;
}

export interface CrmEneaPayloadAuditResult {
  status: "payload_complete" | "payload_incomplete" | "source_unmappable";
  mappingFingerprint: string | null;
  fieldSummary: { ready: number; review: number; missing: number };
  requiredPortalFieldCount: number;
  blockerCount: number;
  blockers: Array<{ code: string; fieldId: string | null; message: string }>;
  excludedUnverifiedFields: string[];
  draftReady: boolean;
  officialSubmissionAllowed: false;
  portalGate: {
    status: "ready" | "blocked";
    reason: string | null;
    workflowFingerprint: string | null;
    supportedPages: string[];
    screeningItemCount: number;
    saveAllowedOnlyBySeparateCapability: true;
    previewAllowed: false;
    submitAllowed: false;
  };
  externalActionAllowed: false;
  reason: string;
}

export type CrmEneaDraftPackageResult =
  | {
    status: "source_unmappable";
    code: "crm-dossier-row-missing" | "crm-source-not-screening";
    reason: string;
  }
  | {
    status: "built";
    source: EneaLabSourcePractice;
    mapped: EneaLabMappedPractice;
    documentAnalysis: EneaLabDocumentAnalysis | undefined;
    issues: EneaLabIssue[];
    payload: EneaLabPayload;
    portalGate: EneaTestDraftPortalGate;
  };

/**
 * Ricostruisce il pacchetto eseguibile esclusivamente dalle stesse fonti
 * congelate usate dal preflight. Nessun dato viene letto dal browser e nessuna
 * azione esterna viene eseguita. Il chiamante deve confrontare i fingerprint
 * con il checkpoint prima di usare il workflow.
 */
export function buildCrmEneaDraftPackage(input: CrmEneaPayloadAuditInput): CrmEneaDraftPackageResult {
  const dossier = object(input.dossierValue); const row = object(dossier?.row);
  if (!row) return { status: "source_unmappable", code: "crm-dossier-row-missing", reason: "Dossier CRM privo della riga sorgente." };

  // `prodotto_installato` e' un'etichetta di coda, non una fonte tecnica.
  // Quando le fonti originarie hanno gia prodotto righe Schermature
  // riconciliate, il mapper deve usare quel modulo anche se la scheda CRM era
  // stata etichettata Infissi. Conserviamo la deviazione nell'audit dei campi,
  // senza cambiare il dossier o il CRM reale.
  const declaredProductLabel = text(row.prodotto_installato);
  const routedByDocumentedProducts = input.products.length > 0 && !/(?:schermatur|tend|pergol|zanzar|persian|avvolgibil|tapparell)/i.test(declaredProductLabel);
  const source = mapQueueRow({
    ...row,
    ...(input.products.length > 0 ? { prodotto_installato: "Schermature solari" } : {}),
    data_fine_lavori: input.completionDate,
    pratica_enea_conclusa_urls: [],
  } as never);
  if (!source) return { status: "source_unmappable", code: "crm-source-not-screening", reason: "Il dossier non è mappabile come pratica schermature." };

  source.queueStatus = "ready";
  if (input.resolvedBuildingUnitCount !== null && input.resolvedBuildingUnitCount !== undefined) {
    source.form.edificio.numero_appartamenti = String(input.resolvedBuildingUnitCount);
    // Una casa singola esplicita resta tale. Le tipologie esplicite fino/oltre
    // tre piani vengono invece conservate: prevalgono sul numero appartamenti
    // della singola pratica e determinano l'ambito plurimo.
    if (input.resolvedBuildingQualification === "single_unit") {
      source.form.edificio.tipologia = "casa_singola_o_plurifamiliare";
    }
  }
  if (input.resolvedTaxCode) source.form.richiedente.cf = input.resolvedTaxCode;
  if (input.resolvedPrimaryBeneficiary) {
    source.form.richiedente.nome = input.resolvedPrimaryBeneficiary.name;
    source.form.richiedente.cognome = input.resolvedPrimaryBeneficiary.surname;
    source.form.richiedente.cf = input.resolvedPrimaryBeneficiary.taxCode;
    if (input.resolvedPrimaryBeneficiary.birthDate) source.form.richiedente.data_nascita = input.resolvedPrimaryBeneficiary.birthDate;
  }
  // Il mapper deriva l'indirizzo lavori dalla residenza quando
  // stesso_indirizzo_lavori e' vero: in quel caso il Comune lavori
  // documentale deve correggere la residenza, non il campo inerte
  // appartamento_lavori che il mapper ignorerebbe.
  const worksMunicipalityAppliesToResidence = Boolean(input.resolvedWorksMunicipality && source.form.residenza.stesso_indirizzo_lavori);
  if (input.resolvedWorksMunicipality) {
    if (worksMunicipalityAppliesToResidence) {
      source.form.residenza.comune = input.resolvedWorksMunicipality.comune;
      source.form.residenza.provincia = input.resolvedWorksMunicipality.provincia;
    } else {
      source.form.appartamento_lavori.comune = input.resolvedWorksMunicipality.comune;
      source.form.appartamento_lavori.provincia = input.resolvedWorksMunicipality.provincia;
    }
  }
  if (input.resolvedCoBeneficiaryPresent === false) {
    source.form.cointestazione = { presente: false, nome: "", cognome: "", cf: "" };
  } else if (input.resolvedCoBeneficiary) {
    source.form.cointestazione = {
      presente: true,
      nome: input.resolvedCoBeneficiary.name,
      cognome: input.resolvedCoBeneficiary.surname,
      cf: input.resolvedCoBeneficiary.taxCode,
    };
  }
  const productItems: SchermaturaItem[] = input.products.map((product) => ({ tipo: screeningType(product.declaredType ?? ""), direzione: screeningDirection(product.exposure ?? "") }));
  source.form.prodotto = { tipo: "schermature", items: productItems };

  let compositeInvoiceBankTransferObserved = false;
  const segments = input.analysis.items.filter((item) => item.customerKey === input.customerKey && item.kind === "invoice" && item.invoiceResult)
    .flatMap((item) => {
      const documentText = item.textPath && existsSync(item.textPath) ? readFileSync(item.textPath, "utf8") : "";
      if (extractBankTransferEvidences(item.documentKey, documentText).length && FISCAL_DOCUMENT_MARKERS.test(documentText)) {
        compositeInvoiceBankTransferObserved = true;
      }
      return splitLocalInvoiceText({
        documentKey: item.documentKey,
        text: documentText,
        extractionMode: item.extractionMode ?? "macos_vision_ocr",
      });
    }).filter((segment) => {
      if (segment.result.documentType !== "invoice" && segment.result.documentType !== "credit_note") return false;
      const bankEvidence = extractBankTransferEvidences(segment.sourceId, segment.text);
      if (!bankEvidence.length) return true;
      // Un allegato puo contenere pagine fiscali e ricevute di bonifico. Il
      // bonifico non invalida l'intero file: conserviamo esclusivamente il
      // segmento che possiede anche marcatori fiscali propri della fattura.
      // Un segmento solo bancario resta escluso in modo fail-closed.
      const isFiscalSegment = FISCAL_DOCUMENT_MARKERS.test(segment.text);
      return isFiscalSegment;
    });
  const parsed = reconcileLocalInvoiceSegments(segments).technicalSegments.map((segment) => ({ result: segment.result, items: segment.items }));
  const fiscalDocumentAnalysis: EneaLabDocumentAnalysis | undefined = parsed.length ? combineDocumentResults(parsed) : undefined;
  const reconciledTechnicalItems = input.products.flatMap((product) =>
    Number.isFinite(product.widthMm) && Number.isFinite(product.heightMm) && Number.isFinite(product.surfaceM2)
      ? [{
        widthMm: product.widthMm!, heightMm: product.heightMm!, surfaceM2: product.surfaceM2!, gTot: product.gTot,
        description: product.description, sourcePath: product.sourceDocumentKey ?? `reconciled:${input.customerKey}`,
      }]
      : []);
  // Il preflight comune ha gia riconciliato fatture e fonti tecniche
  // originarie, applicando cardinalita e precedenze. Il mapper deve consumare
  // quel piano verificato: rileggere qui soltanto la fattura fiscale perdeva
  // misure/gTot presenti nelle schede tecniche e poteva perfino cambiare il
  // numero dei prodotti. I dati economici e le date restano quelli fiscali.
  const documentAnalysis: EneaLabDocumentAnalysis | undefined = reconciledTechnicalItems.length === input.products.length && input.products.length > 0
    ? {
      ...(fiscalDocumentAnalysis ?? { invoiceTotal: 0, creditTotal: 0, eligibleExpense: null, firstInvoiceDate: null, lastInvoiceDate: null, documents: [], blockers: [], warnings: [] }),
      items: reconciledTechnicalItems,
      blockers: (fiscalDocumentAnalysis?.blockers ?? []).filter((message) => !/Nessuna riga di schermatura con dimensioni/i.test(message)),
    }
    : fiscalDocumentAnalysis;
  const mapped = mapSchermaturaPractice(source, documentAnalysis, {
    includeTestConventions: true,
    acceptTestConventionsForDraft: true,
    financialReconciliationVerified: input.financialVerified,
    reconciledEligibleExpense: input.reconciledTotal ?? undefined,
    resolvedScreeningGTot: input.products.map((product) => ({
      value: product.gTot,
      source: product.gTotSource,
      ruleId: product.appliedRuleIds[0],
    })),
    resolvedScreeningMaterial: input.products.map((product) => ({ value: product.material, ruleId: product.appliedRuleIds.includes("authorized-22-schermature-materiale") ? "authorized-22-schermature-materiale" : product.appliedRuleIds[0] })),
    resolvedScreeningRegulation: input.products.map((product) => ({ value: product.movement, ruleId: product.appliedRuleIds.includes("authorized-16-schermature-meccanismo") ? "authorized-16-schermature-meccanismo" : product.appliedRuleIds[0] })),
    resolvedScreeningExposure: input.products.map((product) => product.exposure && product.exposureSource ? ({ value: screeningDirection(product.exposure) || "sud", source: product.exposureSource, ruleId: product.appliedRuleIds.includes(USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm) ? USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm : product.appliedRuleIds[0] }) : undefined),
    resolvedProtectedWindowSurface: input.products.map((product) => product.protectedWindowSurfaceM2 && product.protectedWindowSurfaceSource ? ({ value: product.protectedWindowSurfaceM2, source: product.protectedWindowSurfaceSource, ruleId: product.appliedRuleIds.includes(USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm) ? USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm : product.appliedRuleIds[0], note: product.protectedWindowSurfaceSource === "paper_form_explicit" ? "Superficie finestrata esplicita nel modulo cartaceo Linea Sole Potito." : product.protectedWindowSurfaceSource === "derived_product_surface" ? "Persiana: superficie finestrata protetta uguale alla superficie del singolo prodotto." : "Fallback Linea Sole Potito deterministico da pratica+riga, intervallo autorizzato 2,0-2,9 m²." }) : undefined),
  });
  if (routedByDocumentedProducts) {
    for (const field of mapped.sections.flatMap((section) => section.fields).filter((candidate) => candidate.id === "intervento.tipo" || candidate.id.startsWith("schermature."))) {
      field.appliedRuleIds = [...new Set([...(field.appliedRuleIds ?? []), USER_AUTHORIZED_RULE_IDS.documentedProductModuleOverLabel])];
      field.note = [field.note, `Modulo Schermature determinato dai prodotti delle fonti originarie; etichetta CRM dichiarata '${declaredProductLabel || "non disponibile"}' non usata come vincolo tecnico.`].filter(Boolean).join(" ");
    }
  }
  if (compositeInvoiceBankTransferObserved) {
    for (const field of mapped.sections.flatMap((section) => section.fields).filter((candidate) => candidate.id.startsWith("schermature."))) {
      field.appliedRuleIds = [...new Set([...(field.appliedRuleIds ?? []), COMPOSITE_INVOICE_BANK_TRANSFER_RULE_ID])];
      field.note = [field.note, "Allegato multipagina segmentato: la pagina fiscale e stata conservata e la sola prova di bonifico e stata esclusa dal mapping tecnico."].filter(Boolean).join(" ");
    }
  }
  if (input.resolvedPrimaryBeneficiary) {
    const beneficiaryFields = new Map(mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]));
    for (const fieldId of ["beneficiario.nome", "beneficiario.cognome", "beneficiario.cf", "beneficiario.data_nascita", "beneficiario.sesso"]) {
      const field = beneficiaryFields.get(fieldId);
      if (!field) continue;
      field.source = "Fattura";
      field.appliedRuleIds = [USER_AUTHORIZED_RULE_IDS.officialIdentityOverManualCrm, USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck];
      field.note = `Identita principale verificata in documenti fiscali/ufficiali originari per lo stesso CF; fonti ${input.resolvedPrimaryBeneficiarySourceIds?.join(", ") || "originarie"}.`;
    }
  }
  if (input.resolvedWorksMunicipality) {
    const affectedFieldIds = worksMunicipalityAppliesToResidence ? ["immobile.comune", "beneficiario.comune_residenza"] : ["immobile.comune"];
    for (const fieldId of affectedFieldIds) {
      const field = mapped.sections.flatMap((section) => section.fields).find((candidate) => candidate.id === fieldId);
      if (!field) continue;
      field.source = "Fattura";
      field.appliedRuleIds = [USER_AUTHORIZED_RULE_IDS.officialWorksMunicipalityOverManualCrm];
      field.note = `Comune lavori verificato nel blocco intestatario/destinatario di una fattura originaria: ${input.resolvedWorksMunicipality.comune} (${input.resolvedWorksMunicipality.provincia}); prevale sul dato inserito nel CRM/form. Fonti ${input.resolvedWorksMunicipalitySourceIds?.join(", ") || "originarie"}.`;
    }
  }
  if (input.startDate) {
    const startDateField = mapped.sections.flatMap((section) => section.fields).find((field) => field.id === "intervento.data_inizio");
    if (startDateField) {
      const dateMatch = input.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      startDateField.value = dateMatch ? `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}` : input.startDate;
      startDateField.source = "Fattura";
      startDateField.status = "ready";
      startDateField.appliedRuleIds = [USER_AUTHORIZED_RULE_IDS.invoiceWorkDateChronology];
      startDateField.note = `Data di inizio derivata dalla prima fattura fiscale unica del dossier (${input.startDateSource ?? "fonte originaria"}); la cronologia economica include anche fatture senza righe tecniche.`;
    }
  }
  if (input.resolvedBuildingQualification) {
    const buildingRuleId = input.resolvedBuildingQualification === "multi_unit"
      ? USER_AUTHORIZED_RULE_IDS.explicitBuildingTypeOverApartmentCount
      : USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification;
    const buildingTypeField = mapped.sections.flatMap((section) => section.fields).find((field) => field.id === "immobile.tipologia");
    if (buildingTypeField) {
      buildingTypeField.source = "Regola controllata";
      buildingTypeField.appliedRuleIds = [buildingRuleId];
      buildingTypeField.note = input.resolvedBuildingQualification === "multi_unit"
        ? "La tipologia edificio esplicita del form dichiara un edificio plurimo/fino-oltre tre piani e prevale sul numero appartamenti della singola pratica."
        : "Una unita/casa singola esplicita determina la scelta ENEA a unita unica; il numero dei piani meramente descrittivo non prova condominio o pluralita.";
    }
    const interventionScopeField = mapped.sections.flatMap((section) => section.fields).find((field) => field.id === "intervento.ambito");
    if (interventionScopeField) {
      interventionScopeField.value = input.resolvedBuildingQualification === "multi_unit"
        ? ENEA_INTERVENTION_SCOPE.unitInMultiUnitBuilding
        : ENEA_INTERVENTION_SCOPE.singleUnitBuilding;
      interventionScopeField.source = "Regola controllata";
      interventionScopeField.status = "ready";
      interventionScopeField.appliedRuleIds = [buildingRuleId];
      interventionScopeField.note = input.resolvedBuildingQualification === "multi_unit"
        ? "Edificio plurimo esplicito nel form; una sola unita immobiliare e' oggetto dell'intervento."
        : "Edificio costituito da una singola unita immobiliare secondo la fonte esplicita o il fallback autorizzato.";
    }
  }
  if (input.resolvedCoBeneficiaryPresent === false) {
    const coOwnershipField = mapped.sections.flatMap((section) => section.fields).find((field) => field.id === "beneficiario.cointestazione");
    if (coOwnershipField) {
      coOwnershipField.source = "Fattura";
      coOwnershipField.appliedRuleIds = [USER_AUTHORIZED_RULE_IDS.invoiceIdentityOverCustomerForm];
      coOwnershipField.note = "Cointestatario del form escluso: le fatture originarie riconciliate identificano un solo beneficiario.";
    }
  } else if (input.resolvedCoBeneficiary) {
    for (const fieldId of ["beneficiario.cointestazione", "beneficiario.cointestatario_nome", "beneficiario.cointestatario_cognome", "beneficiario.cointestatario_cf"]) {
      const field = mapped.sections.flatMap((section) => section.fields).find((candidate) => candidate.id === fieldId);
      if (!field) continue;
      field.source = "Fattura";
      field.appliedRuleIds = [USER_AUTHORIZED_RULE_IDS.invoiceIdentityOverCustomerForm, USER_AUTHORIZED_RULE_IDS.invoiceCoBeneficiaryPortalFlow];
      field.note = `Cointestatario confermato dalle fatture originarie ${input.resolvedCoBeneficiary.sourceIds.join(", ")}; la fattura prevale sul form.`;
    }
  }
  const issues = validatePreparedPractice(source, mapped, documentAnalysis);
  const payload = buildEneaPayload(mapped, issues, "draft_test");
  const portalGate = prepareEneaTestDraftPortalCollaudo(mapped, issues, payload, true);
  return { status: "built", source, mapped, documentAnalysis, issues, payload, portalGate };
}

/**
 * Collega il dossier CRM già acquisito al mapper ENEA esistente senza aprire il
 * portale. Il risultato è diagnostico e fail-closed: non abilita alcuna azione
 * esterna e non trasforma review/missing in valori confermati.
 */
export function buildCrmEneaPayloadAudit(input: CrmEneaPayloadAuditInput): CrmEneaPayloadAuditResult {
  const packageResult = buildCrmEneaDraftPackage(input);
  if (packageResult.status === "source_unmappable") return { status: "source_unmappable", mappingFingerprint: null, fieldSummary: { ready: 0, review: 0, missing: 0 }, requiredPortalFieldCount: 0, blockerCount: 1,
    blockers: [{ code: packageResult.code, fieldId: null, message: packageResult.reason }], excludedUnverifiedFields: [], draftReady: false, officialSubmissionAllowed: false, portalGate: { status: "blocked", reason: "source-unmappable", workflowFingerprint: null, supportedPages: [], screeningItemCount: 0, saveAllowedOnlyBySeparateCapability: true, previewAllowed: false, submitAllowed: false }, externalActionAllowed: false, reason: "Payload ENEA non costruibile dal dossier locale." };
  const { mapped, issues, payload, portalGate } = packageResult;
  const blockers = issues.filter((issue) => issue.severity === "blocker").map((issue) => ({ code: issue.code, fieldId: issue.fieldId ?? null, message: issue.message }));
  const complete = blockers.length === 0 && payload.readyForDraftSave && portalGate.status === "ready";
  return {
    status: complete ? "payload_complete" : "payload_incomplete",
    mappingFingerprint: fingerprintPreparedPractice(mapped, issues), fieldSummary: mapped.summary,
    requiredPortalFieldCount: payload.portalFields.length, blockerCount: blockers.length, blockers,
    excludedUnverifiedFields: payload.excludedUnverifiedFields, draftReady: complete, officialSubmissionAllowed: false,
    portalGate: portalGate.status === "ready"
      ? { status: "ready", reason: null, workflowFingerprint: portalGate.fingerprint, supportedPages: portalGate.workflow.supportedPages, screeningItemCount: portalGate.workflow.screeningItemCount, saveAllowedOnlyBySeparateCapability: true, previewAllowed: false, submitAllowed: false }
      : { status: "blocked", reason: portalGate.reason, workflowFingerprint: null, supportedPages: [], screeningItemCount: 0, saveAllowedOnlyBySeparateCapability: true, previewAllowed: false, submitAllowed: false },
    externalActionAllowed: false,
    reason: complete ? "Payload TEST completo per la sola bozza salvata; anteprima e submit restano vietati." : `${blockers.length} campi o controlli impediscono ancora il payload della bozza TEST.`,
  };
}
