import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { emptyFormData, type FormClienteData } from "../../src/types/form-cliente";
import { mapSchermaturaPractice } from "../../src/features/enea-lab/mapper";
import { buildEneaBeneficiaryPortalScript } from "../../src/features/enea-lab/portalBeneficiary";
import { buildEneaBuildingPortalScript } from "../../src/features/enea-lab/portalBuilding";
import { buildEneaGeneratorPortalScript } from "../../src/features/enea-lab/portalGenerator";
import { buildEneaInterventionPortalScript } from "../../src/features/enea-lab/portalIntervention";
import { buildEneaPlantPortalScript } from "../../src/features/enea-lab/portalPlant";
import type { EneaLabDocumentAnalysis, EneaLabSourcePractice } from "../../src/features/enea-lab/types";
import type { EneaPortalWorkflowStep } from "../../src/features/enea-lab/portalScript";
import type { AprInfissiEneaDraftPayload } from "../../src/features/enea-shadow-crm/infissiEneaDraftPayload";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function formFromDossier(dossierValue: unknown): FormClienteData {
  const raw = object(object(dossierValue)?.row)?.dati_form;
  const draft = object(raw) ?? {};
  const base = emptyFormData();
  return {
    ...base,
    ...draft,
    richiedente: { ...base.richiedente, ...(object(draft.richiedente) ?? {}) },
    residenza: { ...base.residenza, ...(object(draft.residenza) ?? {}) },
    appartamento_lavori: { ...base.appartamento_lavori, ...(object(draft.appartamento_lavori) ?? {}) },
    cointestazione: { ...base.cointestazione, ...(object(draft.cointestazione) ?? {}) },
    catastali: { ...base.catastali, ...(object(draft.catastali) ?? {}) },
    edificio: { ...base.edificio, ...(object(draft.edificio) ?? {}) },
    impianto: { ...base.impianto, ...(object(draft.impianto) ?? {}) },
    prodotto: { ...(object(draft.prodotto) ?? {}), tipo: "infissi" },
    documenti: { ...base.documenti, ...(object(draft.documenti) ?? {}) },
  } as FormClienteData;
}

function sourceFromDossier(dossierValue: unknown, input: InfissiDraftPackageInput): EneaLabSourcePractice {
  const row = object(object(dossierValue)?.row) ?? {};
  const form = formFromDossier(dossierValue);
  if (!form.richiedente.nome) form.richiedente.nome = text(row.cliente_nome);
  if (!form.richiedente.cognome) form.richiedente.cognome = text(row.cliente_cognome);
  if (!form.richiedente.cf) form.richiedente.cf = text(row.cliente_cf);
  if (!form.richiedente.email) form.richiedente.email = text(row.cliente_email);
  if (!form.richiedente.telefono) form.richiedente.telefono = text(row.cliente_telefono);
  if (input.resolvedCoBeneficiaryPresent === false) {
    form.cointestazione = { presente: false, nome: "", cognome: "", cf: "" };
  } else if (input.resolvedCoBeneficiary) {
    form.cointestazione = {
      presente: true,
      nome: input.resolvedCoBeneficiary.name,
      cognome: input.resolvedCoBeneficiary.surname,
      cf: input.resolvedCoBeneficiary.taxCode,
    };
  }
  return {
    id: input.practiceId,
    code: `CRM-${input.practiceId.slice(0, 8).toUpperCase()}`,
    reseller: text(object(row.companies)?.ragione_sociale) || "Origine CRM read-only",
    clienteNome: form.richiedente.nome,
    clienteCognome: form.richiedente.cognome,
    prodottoInstallato: text(row.prodotto_installato) || "Infissi / Serramenti",
    ricevutaAt: text(row.form_compilato_at) || text(row.updated_at) || text(row.created_at) || input.startDate,
    dataFineLavori: input.completionDate,
    fattureCount: Array.isArray(row.fatture_urls) ? row.fatture_urls.length : 0,
    documentiCount: Array.isArray(row.documenti_aggiuntivi_urls) ? row.documenti_aggiuntivi_urls.length : 0,
    documentPaths: [],
    queueStatus: "historical",
    form,
  };
}

function sharedWorkflow(source: EneaLabSourcePractice, input: InfissiDraftPackageInput) {
  const analysis: EneaLabDocumentAnalysis = {
    items: [],
    invoiceTotal: input.infissiPayload.expenseGrossVatIncluded,
    creditTotal: 0,
    eligibleExpense: input.infissiPayload.expenseGrossVatIncluded,
    firstInvoiceDate: input.startDate,
    lastInvoiceDate: input.completionDate,
    documents: [],
    blockers: [],
    warnings: [],
  };
  const mapped = mapSchermaturaPractice(source, analysis, {
    includeTestConventions: true,
    acceptTestConventionsForDraft: true,
    documentFiscalCode: input.resolvedTaxCode,
    documentFiscalCodeCoherentWithIdentity: true,
    reconciledEligibleExpense: input.infissiPayload.expenseGrossVatIncluded,
    financialReconciliationVerified: true,
  });
  if (input.resolvedCoBeneficiaryPresent !== undefined) {
    const beneficiaryFields = mapped.sections.flatMap((section) => section.fields).filter((field) => field.id.startsWith("beneficiario.cointestat"));
    for (const field of beneficiaryFields) {
      field.source = "Fattura";
      field.appliedRuleIds = ["user-2026-08-16-invoice-identity-over-customer-form", "user-2026-08-17-invoice-co-beneficiary-person-flow"];
      field.note = input.resolvedCoBeneficiaryPresent
        ? "Cointestatario distinto confermato dalle fatture originarie; la fattura prevale sul form."
        : "Nessun cointestatario distinto nelle fatture originarie; l'eventuale duplicazione del beneficiario principale nel form e esclusa.";
    }
  }
  const beneficiary = buildEneaBeneficiaryPortalScript(mapped);
  const building = buildEneaBuildingPortalScript(mapped);
  const intervention = buildEneaInterventionPortalScript(mapped);
  const plant = buildEneaPlantPortalScript(mapped);
  const generator = buildEneaGeneratorPortalScript(mapped, true);
  const frame = (value: string | null | undefined, old = false) => {
    const normalized = value?.trim().toLocaleLowerCase("it").replace(/_/g, " ") ?? "";
    if (normalized === "legno") return { value: "Legno", selectValue: "61" };
    if (normalized === "pvc") return { value: "PVC", selectValue: "62" };
    if (normalized.includes("metallo") && normalized.includes("taglio") && !normalized.includes("senza")) return { value: "Metallo, taglio termico", selectValue: "63" };
    if (normalized.includes("metallo") && normalized.includes("senza")) return { value: "Metallo, no taglio termico", selectValue: "64" };
    if (normalized === "misto") return { value: "Misto", selectValue: "65" };
    if (old) return { value: "Metallo, no taglio termico", selectValue: "64" };
    throw new Error(`infissi_portal_frame_material_unmapped:${value ?? "missing"}`);
  };
  const glass = (value: string | null | undefined, old = false) => {
    const normalized = value?.trim().toLocaleLowerCase("it").replace(/_/g, " ") ?? "";
    if (normalized.includes("bassa emiss")) return { value: "A bassa emissione", selectValue: "69" };
    if (normalized.includes("singol")) return { value: "Singolo", selectValue: "66" };
    if (normalized.includes("doppi")) return { value: "Doppio", selectValue: "67" };
    if (normalized.includes("tripl")) return { value: "Triplo", selectValue: "68" };
    if (normalized.includes("pannell")) return { value: "Pannello opaco", selectValue: "155" };
    if (old) return { value: "Singolo", selectValue: "66" };
    throw new Error(`infissi_portal_glass_type_unmapped:${value ?? "missing"}`);
  };
  const oldFrame = frame(input.oldFrameMaterial, true);
  const oldGlass = glass(input.oldGlazingType, true);
  const technicalSummary: EneaPortalWorkflowStep = {
    id: "infissi-summary",
    pageName: "Serramenti e infissi",
    markerIds: ["id-costo"],
    fields: [{ portalId: "id-costo", control: "input", value: input.infissiPayload.expenseGrossVatIncluded.toFixed(2).replace(".", ",") }],
    successMessage: "APR Infissi: costo IVA incluso compilato; nessuna anteprima o invio.",
  };
  const calculation: EneaPortalWorkflowStep = {
    id: "infissi-calculation",
    pageName: "Calcolo costi e detrazioni",
    markerIds: ["id-risp"],
    fields: [],
    successMessage: "APR Infissi: risparmio energetico lasciato al calcolo automatico ENEA e soltanto osservabile in audit.",
  };
  const screeningSteps: EneaPortalWorkflowStep[] = input.infissiPayload.windows.map((window, index) => {
    const newFrame = frame(window.frameMaterial);
    const newGlass = glass(window.glassType);
    return {
      id: `infisso-${index + 1}`,
      pageName: `Infisso ${index + 1}`,
      markerIds: ["id-f_pre", "id-v_pre", "id-u_pre", "id-sup", "id-f_post", "id-v_post", "id-u_post", "id-conf", "id-osc"],
      fields: [
        { portalId: "id-f_pre", control: "select", ...oldFrame },
        { portalId: "id-v_pre", control: "select", ...oldGlass },
        { portalId: "id-u_pre", control: "input", value: String(window.oldWindowThermalTransmittanceWm2K).replace(".", ",") },
        { portalId: "id-sup", control: "input", value: window.areaM2.toFixed(1).replace(".", ",") },
        { portalId: "id-f_post", control: "select", ...newFrame },
        { portalId: "id-v_post", control: "select", ...newGlass },
        { portalId: "id-u_post", control: "input", value: String(window.newWindowThermalTransmittanceWm2K).replace(".", ",") },
        { portalId: "id-conf", control: "select", value: "Verso esterno", selectValue: "189" },
        { portalId: "id-osc", control: "checkbox", value: window.shadingClosuresChecked ? "true" : "false" },
      ],
      successMessage: `APR Infissi: prodotto fisico ${index + 1}/${input.infissiPayload.physicalWindowCount} compilato 1:1.`,
    };
  });
  const steps: EneaPortalWorkflowStep[] = [
    { id: "beneficiary", ...beneficiary.runtime },
    { id: "building", ...building.runtime },
    { id: "intervention", ...intervention.runtime },
    { id: "plant", ...plant.runtime },
    { id: "generator", ...generator.runtime },
    technicalSummary,
    calculation,
  ];
  return {
    steps,
    screeningSteps,
    supportedPages: steps.map((step) => step.pageName),
    screeningItemCount: screeningSteps.length,
    preparedFieldIds: [...beneficiary.readyFieldIds, ...building.readyFieldIds, ...intervention.readyFieldIds, ...plant.readyFieldIds, ...generator.readyFieldIds, "id-costo", ...screeningSteps.flatMap((step) => step.fields.map((field) => field.portalId))],
  };
}

export interface InfissiDraftPackageInput {
  customerKey: string;
  displayName: string;
  practiceId: string;
  dossierPath: string;
  startDate: string;
  completionDate: string;
  resolvedTaxCode: string;
  resolvedCoBeneficiaryPresent?: boolean;
  resolvedCoBeneficiary?: { name: string; surname: string; taxCode: string } | null;
  infissiPayload: AprInfissiEneaDraftPayload;
  oldFrameMaterial?: string | null;
  oldGlazingType?: string | null;
  sourceFingerprint: string;
}

/**
 * Pacchetto persistente del modulo Infissi. Ogni serramento fisico resta una
 * riga tecnica separata; costo e campi sono derivati soltanto dal payload
 * auditato e dal contratto DOM reale acquisito in read-only.
 */
export function buildAprInfissiDraftPackage(input: InfissiDraftPackageInput): AprEneaDraftPackage {
  const dossierValue = JSON.parse(readFileSync(input.dossierPath, "utf8")) as unknown;
  const workflow = sharedWorkflow(sourceFromDossier(dossierValue, input), input);
  const workflowFingerprint = sha256({ module: "infissi", workflow, payload: input.infissiPayload });
  const packageFingerprint = sha256({
    customerKey: input.customerKey,
    practiceId: input.practiceId,
    sourceFingerprint: input.sourceFingerprint,
    workflowFingerprint,
  });
  return {
    module: "infissi",
    customerKey: input.customerKey,
    displayName: input.displayName,
    practiceId: input.practiceId,
    packageFingerprint,
    workflowFingerprint,
    workflow,
    infissiPayload: input.infissiPayload,
    safety: {
      createAllowedAfterPersistentIntent: true,
      saveAllowedAfterAllPageCheckpoints: true,
      previewAllowed: false,
      submitAllowed: false,
      communicationsAllowed: false,
    },
  };
}
