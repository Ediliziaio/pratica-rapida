import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export const APR_VEPA_MODULE_VERSION = "apr-vepa-module-v3" as const;

const VEPA_RULE_IDS = Object.freeze([
  USER_AUTHORIZED_RULE_IDS.vepaBonusCasaRouting,
  USER_AUTHORIZED_RULE_IDS.vepaDeferredCurrentPhase,
  USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
  USER_AUTHORIZED_RULE_IDS.formInvoicePortalCardinalityCrossCheck,
  "system-apr-operator-intervention-routing",
  "system-operator-block-fail-closed",
] as const);

const VEPA_SHARED_ANAGRAPHIC_RULE_IDS = Object.freeze([
  USER_AUTHORIZED_RULE_IDS.invoiceIdentityOverCustomerForm,
  USER_AUTHORIZED_RULE_IDS.invoiceCoBeneficiaryPortalFlow,
  USER_AUTHORIZED_RULE_IDS.validOriginalDocumentFiscalCode,
  USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck,
  USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification,
  USER_AUTHORIZED_RULE_IDS.explicitBuildingTypeOverApartmentCount,
] as const);

export const APR_VEPA_SHARED_ANAGRAPHIC_CONTRACT = Object.freeze({
  status: "local_contract_ready" as const,
  scheme: "bonus_casa" as const,
  ecobonusAllowed: false as const,
  sections: Object.freeze([
    "beneficiary_identity",
    "co_beneficiaries",
    "birth_and_fiscal_code",
    "residence",
    "property_identity",
    "building_qualification",
  ] as const),
  sourcePrecedence: Object.freeze([
    "original_invoice_for_beneficiary_and_co_beneficiaries",
    "customer_form_for_non_conflicting_personal_and_property_data",
    "fiscal_code_formal_and_anagraphic_cross_check",
    "operator_required_when_primary_sources_remain_ambiguous",
  ] as const),
  portalFieldMapping: "not_observed" as const,
  externalActionAllowed: false as const,
  appliedRuleIds: VEPA_SHARED_ANAGRAPHIC_RULE_IDS,
});

export interface AprVepaSourceLine {
  sourceId: string;
  lineId: string;
  description: string;
  quantity: number;
  widthMm?: number | null;
  heightMm?: number | null;
  explicitSurfaceM2?: number | null;
  grossAmount?: number | null;
}

export interface AprVepaLocalInput {
  practiceId: string;
  displayName: string;
  invoiceLines: readonly AprVepaSourceLine[];
  formDeclaredCount?: number | null;
}

export interface AprVepaPhysicalRow {
  rowId: string;
  sourceId: string;
  sourceLineId: string;
  pieceNumber: number;
  description: string;
  widthMm: number | null;
  heightMm: number | null;
  surfaceM2: number;
  surfaceSource: "invoice_explicit_surface" | "invoice_dimensions";
  allocatedGrossAmount: number | null;
  appliedRuleIds: readonly string[];
}

const roundSurface = (value: number) => Math.round((value + Number.EPSILON) * 10_000) / 10_000;
const positive = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) && value > 0;

export function buildAprVepaLocalPlan(input: AprVepaLocalInput) {
  const blockers: Array<{ code: string; reason: string; sourceIds: string[] }> = [];
  const warnings: Array<{ code: string; reason: string; sourceIds: string[] }> = [];
  const rows: AprVepaPhysicalRow[] = [];

  if (!input.practiceId.trim() || !input.displayName.trim()) throw new Error("vepa_identity_required");
  if (input.invoiceLines.length === 0) blockers.push({ code: "vepa_original_invoice_missing", reason: "Nessuna riga VEPA proveniente da fattura originaria disponibile.", sourceIds: [] });

  for (const line of input.invoiceLines) {
    if (!/\b(?:vepa|vetrat[ae]\s+(?:panoramic[haei]|scorrevol[ei]))\b/i.test(line.description)) {
      blockers.push({ code: `vepa_line_not_qualified:${line.lineId}`, reason: "La riga non identifica esplicitamente una VEPA o vetrata panoramica/scorrevole.", sourceIds: [line.sourceId] });
      continue;
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) {
      blockers.push({ code: `vepa_quantity_invalid:${line.lineId}`, reason: "Quantita VEPA assente o non plausibile: nessuna cardinalita viene inventata.", sourceIds: [line.sourceId] });
      continue;
    }
    const explicitSurface = positive(line.explicitSurfaceM2) ? roundSurface(line.explicitSurfaceM2!) : null;
    const dimensionSurface = positive(line.widthMm) && positive(line.heightMm) ? roundSurface((line.widthMm! * line.heightMm!) / 1_000_000) : null;
    const surface = explicitSurface ?? dimensionSurface;
    if (surface === null) {
      blockers.push({ code: `vepa_surface_missing:${line.lineId}`, reason: "La fattura e gli allegati originari non documentano ne metri quadrati ne misure complete della VEPA.", sourceIds: [line.sourceId] });
      continue;
    }
    for (let pieceNumber = 1; pieceNumber <= line.quantity; pieceNumber += 1) rows.push({
      rowId: `${line.sourceId}:${line.lineId}:piece-${pieceNumber}`,
      sourceId: line.sourceId,
      sourceLineId: line.lineId,
      pieceNumber,
      description: line.description,
      widthMm: positive(line.widthMm) ? line.widthMm! : null,
      heightMm: positive(line.heightMm) ? line.heightMm! : null,
      surfaceM2: surface,
      surfaceSource: explicitSurface !== null ? "invoice_explicit_surface" : "invoice_dimensions",
      allocatedGrossAmount: positive(line.grossAmount) ? roundSurface(line.grossAmount! / line.quantity) : null,
      appliedRuleIds: VEPA_RULE_IDS,
    });
  }

  if (positive(input.formDeclaredCount) && Number(input.formDeclaredCount) !== rows.length) warnings.push({
    code: "vepa_form_invoice_cardinality_difference",
    reason: `Il form dichiara ${input.formDeclaredCount} elementi, la fattura originaria documenta ${rows.length} pezzi VEPA: il piano conserva la cardinalita fisica della fattura e segnala la differenza per il controllo pre-bozza.`,
    sourceIds: input.invoiceLines.map((line) => line.sourceId),
  });

  const status = blockers.length ? "operator_required" as const : "ready_for_portal_mapping" as const;
  return Object.freeze({
    version: APR_VEPA_MODULE_VERSION,
    scheme: "bonus_casa" as const,
    ecobonusAllowed: false as const,
    practiceId: input.practiceId,
    displayName: input.displayName,
    status,
    rows: Object.freeze(rows),
    totalPhysicalPieces: rows.length,
    totalSurfaceM2: roundSurface(rows.reduce((sum, row) => sum + row.surfaceM2, 0)),
    warnings: Object.freeze(warnings),
    blockers: Object.freeze(blockers),
    portalMappingVerified: false as const,
    sharedAnagraphicContract: APR_VEPA_SHARED_ANAGRAPHIC_CONTRACT,
    draftAllowed: false as const,
    externalActionAllowed: false as const,
    nextAction: status === "operator_required"
      ? "Mostrare motivo e fonte in Richiesto intervento operatore; la coda successiva puo proseguire."
      : "Applicare il contratto anagrafico condiviso locale; osservare e versionare il flusso Bonus Casa prima di abilitare qualsiasi bozza.",
    appliedRuleIds: VEPA_RULE_IDS,
  });
}

export function aprVepaModuleReadinessSnapshot() {
  return Object.freeze({
    version: APR_VEPA_MODULE_VERSION,
    product: "vepa" as const,
    scheme: "bonus_casa" as const,
    ecobonusAllowed: false as const,
    localSourceExtraction: "implemented_and_tested" as const,
    physicalCardinality: "implemented_and_tested" as const,
    surfacePrecedence: "invoice_explicit_then_invoice_dimensions" as const,
    operatorRouting: "implemented_and_tested" as const,
    sharedAnagraphicContract: "implemented_and_tested_locally" as const,
    portalMapping: "not_observed" as const,
    realDraft: "disabled" as const,
    preview: "forbidden" as const,
    submit: "forbidden" as const,
    appliedRuleIds: VEPA_RULE_IDS,
  });
}
