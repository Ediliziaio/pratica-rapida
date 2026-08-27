import {
  APR_BUSINESS_DECISIONS_VERSION,
  type AprBusinessDecision,
  type AprBusinessDecisionsArtifact,
  type AprCanonicalValue,
} from "./aprLevelSeparationContracts";
import {
  envelopeImmutableArtifact,
  verifyImmutableArtifactEnvelope,
  type AprImmutableArtifactEnvelope,
} from "./aprMonotonicArtifacts";

export const APR_ENEA_PURE_MAPPER_VERSION = "apr-enea-pure-mapper-v1" as const;

export type AprEneaPortalFieldValue = string | number | boolean;

export interface AprEneaMappedPortalField {
  fieldId: string;
  value: AprEneaPortalFieldValue;
  sourceDecisionId: string;
  appliedRuleIds: readonly string[];
}
export interface AprEneaMappingPayload {
  schemaVersion: typeof APR_ENEA_PURE_MAPPER_VERSION;
  mode: "parallel_observation_only";
  sourceDecisionArtifactId: string;
  customerKey: string;
  practiceId: string;
  status: "mapped" | "blocked";
  portalFields: readonly AprEneaMappedPortalField[];
  consumedDecisionIds: readonly string[];
  auditOnlyDecisionIds: readonly string[];
  blockers: readonly string[];
  operationalAuthority: false;
}

export type AprEneaMappingArtifact = AprImmutableArtifactEnvelope<AprEneaMappingPayload>;

type CanonicalObject = Readonly<Record<string, AprCanonicalValue>>;

const SUPPORTED_DECISION_FIELDS = new Set([
  "economic.eligibleExpense",
  "economic.bankTransferCheck",
  "product.screening.physical_rows",
  "product.infissi.physical_rows",
]);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalObject(value: AprCanonicalValue): CanonicalObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CanonicalObject : null;
}

function finiteNumber(value: AprCanonicalValue, minimum: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : null;
}

function nonEmptyString(value: AprCanonicalValue): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function field(decision: AprBusinessDecision, fieldId: string, value: AprEneaPortalFieldValue): AprEneaMappedPortalField {
  return {
    fieldId,
    value,
    sourceDecisionId: decision.decisionId,
    appliedRuleIds: [...decision.appliedRuleIds],
  };
}

function mapEconomicExpense(decision: AprBusinessDecision): AprEneaMappedPortalField[] | null {
  const amount = finiteNumber(decision.resolvedValue, 0);
  return amount === null ? null : [field(decision, "calcolo.spesa_ammissibile_lorda_iva_inclusa", amount)];
}

function mapScreeningRows(decision: AprBusinessDecision): AprEneaMappedPortalField[] | null {
  const root = canonicalObject(decision.resolvedValue);
  const rows = root?.physicalRows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const output: AprEneaMappedPortalField[] = [field(decision, "schermature.numero", rows.length)];
  for (const [index, rawRow] of rows.entries()) {
    const row = canonicalObject(rawRow);
    if (!row) return null;
    const widthMm = finiteNumber(row.widthMm, Number.EPSILON);
    const heightMm = finiteNumber(row.heightMm, Number.EPSILON);
    const surfaceM2 = finiteNumber(row.surfaceM2, Number.EPSILON);
    if (widthMm === null || heightMm === null || surfaceM2 === null) return null;
    output.push(
      field(decision, `schermature.${index}.dimensioni`, `${widthMm} × ${heightMm} mm`),
      field(decision, `schermature.${index}.superficie`, surfaceM2),
    );
  }
  return output;
}

function mapInfissiRows(decision: AprBusinessDecision): AprEneaMappedPortalField[] | null {
  const root = canonicalObject(decision.resolvedValue);
  const rows = root?.physicalRows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const output: AprEneaMappedPortalField[] = [field(decision, "infissi.numero", rows.length)];
  for (const [index, rawRow] of rows.entries()) {
    const row = canonicalObject(rawRow);
    if (!row || !nonEmptyString(row.physicalRowId)) return null;
    const areaM2 = finiteNumber(row.eneaAreaM2, Number.EPSILON);
    const transmittance = finiteNumber(row.thermalTransmittanceWm2K, Number.EPSILON);
    if (areaM2 === null || transmittance === null) return null;
    output.push(
      field(decision, `infissi.${index}.superficie`, areaM2),
      field(decision, `infissi.${index}.trasmittanza_nuovo`, transmittance),
    );
  }
  return output;
}

function invalidArtifact(artifact: AprBusinessDecisionsArtifact) {
  return !verifyImmutableArtifactEnvelope(artifact)
    || artifact.payload.schemaVersion !== APR_BUSINESS_DECISIONS_VERSION
    || artifact.payload.mode !== "parallel_observation_only"
    || artifact.payload.operationalAuthority !== false;
}

/**
 * Livello 4 puro: l'unico input e l'artefatto decisionale L3. Non legge fonti,
 * non riconcilia, non sceglie fallback e non completa campi assenti.
 */
export function mapBusinessDecisionArtifactToEnea(decisionsArtifact: AprBusinessDecisionsArtifact): AprEneaMappingArtifact {
  if (invalidArtifact(decisionsArtifact)) throw new Error("apr_l4_invalid_business_decision_artifact");
  const portalFields: AprEneaMappedPortalField[] = [];
  const consumedDecisionIds: string[] = [];
  const auditOnlyDecisionIds: string[] = [];
  const blockers: string[] = [];

  for (const decision of decisionsArtifact.payload.decisions) {
    if (!SUPPORTED_DECISION_FIELDS.has(decision.field)) {
      blockers.push(`apr_l4_unsupported_decision:${decision.field}`);
      continue;
    }
    if (decision.status !== "resolved") {
      blockers.push(`apr_l4_unresolved_decision:${decision.field}:${decision.blockerCode ?? "missing_blocker"}`);
      continue;
    }
    if (decision.field === "economic.bankTransferCheck") {
      auditOnlyDecisionIds.push(decision.decisionId);
      continue;
    }
    const mapped = decision.field === "economic.eligibleExpense"
      ? mapEconomicExpense(decision)
      : decision.field === "product.screening.physical_rows"
        ? mapScreeningRows(decision)
        : mapInfissiRows(decision);
    if (!mapped) {
      blockers.push(`apr_l4_mapping_value_invalid:${decision.field}`);
      continue;
    }
    portalFields.push(...mapped);
    consumedDecisionIds.push(decision.decisionId);
  }

  if (portalFields.length === 0 && blockers.length === 0) blockers.push("apr_l4_no_mappable_decision");
  const duplicateField = portalFields.find((item, index) => portalFields.findIndex((candidate) => candidate.fieldId === item.fieldId) !== index);
  if (duplicateField) blockers.push(`apr_l4_duplicate_portal_field:${duplicateField.fieldId}`);
  const blocked = blockers.length > 0;
  const payload: AprEneaMappingPayload = {
    schemaVersion: APR_ENEA_PURE_MAPPER_VERSION,
    mode: "parallel_observation_only",
    sourceDecisionArtifactId: decisionsArtifact.artifactId,
    customerKey: decisionsArtifact.payload.customerKey,
    practiceId: decisionsArtifact.payload.practiceId,
    status: blocked ? "blocked" : "mapped",
    portalFields: blocked ? [] : portalFields,
    consumedDecisionIds: blocked ? [] : consumedDecisionIds,
    auditOnlyDecisionIds,
    blockers: [...new Set(blockers)].sort(),
    operationalAuthority: false,
  };
  return deepFreeze(envelopeImmutableArtifact(payload));
}
