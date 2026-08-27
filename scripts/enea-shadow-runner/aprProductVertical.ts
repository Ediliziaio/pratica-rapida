import {
  observeAprInfissiTechnicalCandidates,
  resolveAprInfissiTechnicalCandidates,
  type AprInfissiTechnicalCandidateSet,
  type AprInfissiTextSource,
} from "../../src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence";
import { resolveInfissiTechnicalSources } from "../../src/features/enea-shadow-crm/infissiTechnicalSources";
import { USER_AUTHORIZED_RULE_IDS, registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import {
  createBusinessDecisionsArtifact,
  createCanonicalFactsArtifact,
  type AprBusinessDecisionsArtifact,
  type AprCanonicalFactExtractionMethod,
  type AprCanonicalFactSourceLocator,
  type AprCanonicalFactsArtifact,
  type AprCanonicalValue,
} from "./aprLevelSeparationContracts";
import { resolveFormScreeningMappings } from "./crmLocalPreflight";

export const APR_PRODUCT_VERTICAL_VERSION = "apr-product-vertical-v1" as const;
export const APR_PRODUCT_OBSERVATION_RULE_ID = "system-apr-canonical-fact-boundary-v1" as const;
const SURFACE_TOLERANCE = 0.05;

export type AprProductModule = "screening" | "infissi";
export type AprProductMeasureUnit = "m" | "cm" | "mm";

export interface AprScreeningObservation {
  observationId: string;
  sequence: number;
  sourceId: string;
  description: string;
  declaredQuantity: number;
  originalWidth: number;
  originalHeight: number;
  explicitUnit: AprProductMeasureUnit | null;
  normalizedWidthMm: number;
  normalizedHeightMm: number;
  explicitSurfaceM2: number | null;
  observedTransmittanceWm2K: number | null;
  locator: AprCanonicalFactSourceLocator;
  extractionMethod: Exclude<AprCanonicalFactExtractionMethod, "legacy_projection">;
  extractionRuleId: string;
}

export interface AprScreeningFormObservation {
  sequence: number;
  sourceId: string;
  declaredType: string | null;
  locator: AprCanonicalFactSourceLocator;
}

export interface AprProductFactsInput {
  customerKey: string;
  practiceId: string;
  sourceFingerprint: string;
  module: AprProductModule;
  screeningObservations?: readonly AprScreeningObservation[];
  screeningFormObservations?: readonly AprScreeningFormObservation[];
  infissiSources?: readonly AprInfissiTextSource[];
}

export interface AprProductVerticalResult {
  schemaVersion: typeof APR_PRODUCT_VERTICAL_VERSION;
  factsArtifact: AprCanonicalFactsArtifact;
  decisionsArtifact: AprBusinessDecisionsArtifact;
  module: AprProductModule;
  status: "ready" | "operator_required";
  physicalRows: readonly Record<string, AprCanonicalValue>[];
  blockerCodes: readonly string[];
}

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const asCanonical = (value: unknown): AprCanonicalValue => JSON.parse(JSON.stringify(value ?? null)) as AprCanonicalValue;
const precedence = (ruleIds: readonly string[]) => ruleIds.flatMap((id) => {
  const rule = registryRule(id);
  if (!rule) throw new Error(`apr_product_rule_missing:${id}`);
  return [...rule.sourcePrecedence];
});

function assertLocator(locator: AprCanonicalFactSourceLocator) {
  if (!locator.sourceId.trim()) throw new Error("apr_product_locator_source_missing");
  return locator;
}

function screeningFactValue(item: AprScreeningObservation) {
  if (!Number.isInteger(item.sequence) || item.sequence < 0) throw new Error("apr_product_screening_sequence_invalid");
  if (!Number.isInteger(item.declaredQuantity) || item.declaredQuantity < 1) throw new Error("apr_product_screening_quantity_invalid");
  if (![item.originalWidth, item.originalHeight, item.normalizedWidthMm, item.normalizedHeightMm].every(finitePositive)) {
    throw new Error("apr_product_screening_measure_invalid");
  }
  return {
    observationId: item.observationId,
    sequence: item.sequence,
    sourceId: item.sourceId,
    description: item.description,
    declaredQuantity: item.declaredQuantity,
    originalWidth: item.originalWidth,
    originalHeight: item.originalHeight,
    explicitUnit: item.explicitUnit,
    normalizedWidthMm: item.normalizedWidthMm,
    normalizedHeightMm: item.normalizedHeightMm,
    explicitSurfaceM2: item.explicitSurfaceM2,
    observedTransmittanceWm2K: item.observedTransmittanceWm2K,
  };
}

function infissiCandidateFacts(sources: readonly AprInfissiTextSource[]) {
  const observations = observeAprInfissiTechnicalCandidates(sources);
  const candidateFacts = observations.candidates.map((candidate, sequence) => ({
    field: `product.infissi.candidate.${sequence + 1}`,
    status: "observed" as const,
    value: asCanonical({ sequence, ...candidate }),
    sourceIds: [candidate.sourceId],
    sourceLocators: [{ sourceId: candidate.sourceId, pageNumber: null, contentSha256: null, excerptSha256: null }],
    extractionMethod: "pdf_text" as const,
    confidence: "high" as const,
    extractionRuleId: USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution,
  }));
  const excludedFacts = observations.excludedSources.map((excluded, sequence) => ({
    field: `product.infissi.excluded_source.${sequence + 1}`,
    status: "observed" as const,
    value: asCanonical({ sequence, ...excluded }),
    sourceIds: [excluded.sourceId],
    sourceLocators: [{ sourceId: excluded.sourceId, pageNumber: null, contentSha256: null, excerptSha256: null }],
    extractionMethod: "pdf_text" as const,
    confidence: "high" as const,
    extractionRuleId: USER_AUTHORIZED_RULE_IDS.crmInternalTechnicalDocumentUntrusted,
  }));
  return [...candidateFacts, ...excludedFacts];
}

export function createProductFactsArtifact(input: AprProductFactsInput): AprCanonicalFactsArtifact {
  const moduleFact = {
    field: "product.module",
    status: "observed" as const,
    value: input.module,
    sourceIds: [`${input.practiceId}:routing`],
    sourceLocators: [{ sourceId: `${input.practiceId}:routing`, pageNumber: null, contentSha256: null, excerptSha256: null }],
    extractionMethod: "crm_field" as const,
    confidence: "high" as const,
    extractionRuleId: APR_PRODUCT_OBSERVATION_RULE_ID,
  };
  const screeningFacts = (input.screeningObservations ?? []).map((item) => ({
    field: `product.screening.observation.${item.sequence + 1}`,
    status: "observed" as const,
    value: asCanonical(screeningFactValue(item)),
    sourceIds: [item.sourceId],
    sourceLocators: [assertLocator(item.locator)],
    extractionMethod: item.extractionMethod,
    confidence: "high" as const,
    extractionRuleId: item.extractionRuleId,
  }));
  const formFacts = (input.screeningFormObservations ?? []).map((item) => ({
    field: `product.screening.form.${item.sequence + 1}`,
    status: "observed" as const,
    value: asCanonical({ sequence: item.sequence, sourceId: item.sourceId, declaredType: item.declaredType }),
    sourceIds: [item.sourceId],
    sourceLocators: [assertLocator(item.locator)],
    extractionMethod: "crm_field" as const,
    confidence: "high" as const,
    extractionRuleId: USER_AUTHORIZED_RULE_IDS.formInvoicePortalCardinalityCrossCheck,
  }));
  const facts = input.module === "screening"
    ? [moduleFact, ...screeningFacts, ...formFacts]
    : [moduleFact, ...infissiCandidateFacts(input.infissiSources ?? [])];
  return createCanonicalFactsArtifact({
    customerKey: input.customerKey,
    practiceId: input.practiceId,
    sourceFingerprint: input.sourceFingerprint,
    facts,
  });
}

function factsWithPrefix(artifact: AprCanonicalFactsArtifact, prefix: string) {
  return artifact.payload.facts.filter((fact) => fact.field.startsWith(prefix));
}

function objectValue(value: AprCanonicalValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("apr_product_fact_object_required");
  return value as Record<string, AprCanonicalValue>;
}

function numberValue(value: AprCanonicalValue) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("apr_product_fact_number_required");
  return value;
}

function stringValue(value: AprCanonicalValue) {
  if (typeof value !== "string") throw new Error("apr_product_fact_string_required");
  return value;
}

function measureInMillimetres(value: Record<string, AprCanonicalValue>, axis: "Width" | "Height") {
  const original = numberValue(value[`original${axis}`]);
  const observedNormalized = numberValue(value[`normalized${axis}Mm`]);
  const unit = value.explicitUnit;
  const multiplier = unit === "m" ? 1000 : unit === "cm" ? 10 : unit === "mm" ? 1 : null;
  if (multiplier === null) return { millimetres: observedNormalized, conflict: false };
  const independentlyConverted = Math.round((original * multiplier + Number.EPSILON) * 1000) / 1000;
  return { millimetres: independentlyConverted, conflict: Math.abs(independentlyConverted - observedNormalized) > 0.001 };
}

function screeningDecision(factsArtifact: AprCanonicalFactsArtifact) {
  const observationFacts = factsWithPrefix(factsArtifact, "product.screening.observation.");
  const observations = observationFacts.map((fact) => ({ fact, value: objectValue(fact.value) }))
    .sort((left, right) => numberValue(left.value.sequence) - numberValue(right.value.sequence));
  const blockerCodes: string[] = [];
  const physicalRows: Record<string, AprCanonicalValue>[] = [];
  for (const { value } of observations) {
    const quantity = numberValue(value.declaredQuantity);
    const width = measureInMillimetres(value, "Width");
    const height = measureInMillimetres(value, "Height");
    if (width.conflict || height.conflict) {
      blockerCodes.push("screening_measurement_normalization_conflict");
      continue;
    }
    const widthMm = width.millimetres;
    const heightMm = height.millimetres;
    const calculatedSurfaceM2 = Math.round(((widthMm * heightMm) / 1_000_000 + Number.EPSILON) * 10_000) / 10_000;
    const explicitSurfaceM2 = typeof value.explicitSurfaceM2 === "number" ? value.explicitSurfaceM2 : null;
    const relativeDifference = explicitSurfaceM2 && explicitSurfaceM2 > 0
      ? Math.abs(calculatedSurfaceM2 - explicitSurfaceM2) / explicitSurfaceM2
      : null;
    if (relativeDifference !== null && relativeDifference > SURFACE_TOLERANCE + Number.EPSILON) {
      blockerCodes.push("screening_dimension_surface_conflict");
      continue;
    }
    for (let pieceIndex = 1; pieceIndex <= quantity; pieceIndex += 1) physicalRows.push({
      observationId: stringValue(value.observationId),
      pieceIndex,
      widthMm,
      heightMm,
      surfaceM2: explicitSurfaceM2 ?? calculatedSurfaceM2,
      description: stringValue(value.description),
      observedTransmittanceWm2K: typeof value.observedTransmittanceWm2K === "number" ? value.observedTransmittanceWm2K : null,
    });
  }
  const formFacts = factsWithPrefix(factsArtifact, "product.screening.form.")
    .map((fact) => objectValue(fact.value))
    .sort((left, right) => numberValue(left.sequence) - numberValue(right.sequence));
  const formValues = formFacts.map((value) => ({ tipo_prodotto: typeof value.declaredType === "string" ? value.declaredType : "" }));
  const mapping = resolveFormScreeningMappings(formValues, physicalRows.map((row) => stringValue(row.description)));
  if (formValues.length > 0 && mapping.status === "cardinality_mismatch") blockerCodes.push("product_cardinality_form_invoice_mismatch");
  if (physicalRows.length === 0) blockerCodes.push("screenings_missing");
  const uniqueBlockers = [...new Set(blockerCodes)].sort();
  const ruleIds = [
    USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
    USER_AUTHORIZED_RULE_IDS.formInvoicePortalCardinalityCrossCheck,
    USER_AUTHORIZED_RULE_IDS.formGroupProductInheritance,
    USER_AUTHORIZED_RULE_IDS.screeningDimensionUnitSurfaceCoherence,
  ];
  return {
    physicalRows,
    blockerCodes: uniqueBlockers,
    decision: {
      field: "product.screening.physical_rows",
      status: uniqueBlockers.length ? "operator_required" as const : "resolved" as const,
      resolvedValue: uniqueBlockers.length ? null : asCanonical({ physicalRows, formMappingStatus: mapping.status }),
      blockerCode: uniqueBlockers[0] ?? null,
      inputFactIds: [...observationFacts, ...factsWithPrefix(factsArtifact, "product.screening.form.")].map((fact) => fact.factId),
      appliedRuleIds: ruleIds,
      sourcePrecedence: precedence(ruleIds),
      reason: uniqueBlockers.length
        ? `Riconciliazione quantita/misure schermature bloccata: ${uniqueBlockers.join(", ")}.`
        : `${physicalRows.length} prodotti fisici riconciliati; osservazioni L2 preservate separatamente.`,
    },
  };
}

function candidateSetFromFacts(factsArtifact: AprCanonicalFactsArtifact): AprInfissiTechnicalCandidateSet {
  const candidateFacts = factsWithPrefix(factsArtifact, "product.infissi.candidate.");
  const candidates = candidateFacts.map((fact) => {
    const value = objectValue(fact.value);
    const rows = Array.isArray(value.rows) ? value.rows.map((rowValue) => {
      const row = objectValue(rowValue);
      return {
        lineId: stringValue(row.lineId),
        quantity: numberValue(row.quantity),
        widthM: typeof row.widthM === "number" ? row.widthM : undefined,
        heightM: typeof row.heightM === "number" ? row.heightM : undefined,
        thermalTransmittanceWm2K: typeof row.thermalTransmittanceWm2K === "number" ? row.thermalTransmittanceWm2K : undefined,
        measurementKind: typeof row.measurementKind === "string" ? row.measurementKind as "overall_external" | "other_documented" | "documented_unspecified" : undefined,
      };
    }) : [];
    return {
      sourceId: stringValue(value.sourceId),
      sourceKind: stringValue(value.sourceKind),
      parser: stringValue(value.parser),
      rows,
      explicitUwCount: numberValue(value.explicitUwCount),
      declaredPerformancePageCount: typeof value.declaredPerformancePageCount === "number" ? value.declaredPerformancePageCount : null,
    };
  });
  const excludedSources = factsWithPrefix(factsArtifact, "product.infissi.excluded_source.").map((fact) => {
    const value = objectValue(fact.value);
    return { sourceId: stringValue(value.sourceId), kind: stringValue(value.kind), reason: stringValue(value.reason) };
  });
  return {
    candidates,
    excludedSources,
    appliedRuleIds: [
      USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution,
      USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback,
      USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
      USER_AUTHORIZED_RULE_IDS.crmInternalTechnicalDocumentUntrusted,
      USER_AUTHORIZED_RULE_IDS.testExNovoOriginalSourcesOnly,
    ],
  };
}

function infissiDecision(factsArtifact: AprCanonicalFactsArtifact) {
  const candidateFacts = factsWithPrefix(factsArtifact, "product.infissi.candidate.");
  const excludedFacts = factsWithPrefix(factsArtifact, "product.infissi.excluded_source.");
  const automatic = resolveAprInfissiTechnicalCandidates(candidateSetFromFacts(factsArtifact));
  const technical = resolveInfissiTechnicalSources({
    practiceId: factsArtifact.payload.practiceId,
    invoice: automatic.evidence?.kind === "invoice" ? automatic.evidence : undefined,
    technicalDocuments: automatic.evidence?.kind === "technical_document" ? automatic.evidence : undefined,
  });
  const blockerCodes = [...new Set([...automatic.blockers, ...technical.blockers])].sort();
  const physicalRows = technical.rows.map((row) => asCanonical(row) as Record<string, AprCanonicalValue>);
  const ruleIds = [
    USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution,
    USER_AUTHORIZED_RULE_IDS.infissiAreaRounding,
    USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback,
    USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
    USER_AUTHORIZED_RULE_IDS.crmInternalTechnicalDocumentUntrusted,
  ];
  return {
    physicalRows,
    blockerCodes,
    decision: {
      field: "product.infissi.physical_rows",
      status: blockerCodes.length ? "operator_required" as const : "resolved" as const,
      resolvedValue: blockerCodes.length ? null : asCanonical({ physicalRows, selectedSourceId: automatic.audit.selectedSourceId, selectedParser: automatic.audit.selectedParser }),
      blockerCode: blockerCodes[0] ?? null,
      inputFactIds: [...candidateFacts, ...excludedFacts].map((fact) => fact.factId),
      appliedRuleIds: ruleIds,
      sourcePrecedence: precedence(ruleIds),
      reason: blockerCodes.length
        ? `Riconciliazione quantita/misure Infissi bloccata: ${blockerCodes.join(", ")}.`
        : `${physicalRows.length} infissi fisici riconciliati da candidati L2 separati.`,
    },
  };
}

export function decideProductFacts(factsArtifact: AprCanonicalFactsArtifact): AprProductVerticalResult {
  const moduleFact = factsArtifact.payload.facts.find((fact) => fact.field === "product.module");
  if (!moduleFact || (moduleFact.value !== "screening" && moduleFact.value !== "infissi")) throw new Error("apr_product_module_fact_missing");
  const module = moduleFact.value;
  const result = module === "screening" ? screeningDecision(factsArtifact) : infissiDecision(factsArtifact);
  const decisionsArtifact = createBusinessDecisionsArtifact({ factsArtifact, decisions: [result.decision] });
  return Object.freeze({
    schemaVersion: APR_PRODUCT_VERTICAL_VERSION,
    factsArtifact,
    decisionsArtifact,
    module,
    status: result.blockerCodes.length ? "operator_required" : "ready",
    physicalRows: Object.freeze(result.physicalRows),
    blockerCodes: Object.freeze(result.blockerCodes),
  });
}

export function runProductVertical(input: AprProductFactsInput) {
  return decideProductFacts(createProductFactsArtifact(input));
}
