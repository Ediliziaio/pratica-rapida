export type PostPilotDifferenceCategory =
  | "coincidente"
  | "assunzione_operativa_attesa"
  | "inconcludente_per_fonte_assente"
  | "conflitto_con_fonte_originaria";

export type ComparisonProvenance =
  | "verified_source"
  | "operational_assumption"
  | "portal_derived";

export interface ComparisonValue {
  value: string | number | boolean | null;
  provenance: ComparisonProvenance;
  sourceId: string;
}

export interface PostSubmitBenchmarkValue {
  value: string | number | boolean | null;
  /** Il benchmark storico descrive soltanto l'output manuale post-invio. */
  sourceAvailable: false;
}

export interface PostPilotComparisonField {
  field: string;
  test: ComparisonValue;
  benchmark: PostSubmitBenchmarkValue;
  originalSource?: { value: ComparisonValue["value"]; sourceId: string };
}

export interface EnergySavingsTrace {
  policyVersion: string;
  formula: string;
  coefficient: number;
  coefficientUnit: "kWh/anno per m²";
  resultUnit: "kWh/anno";
  rows: readonly { rowId: string; surfaceM2: number; sourceId: string; provenance: "verified_source" | "operator_verified" }[];
  totalSurfaceM2: number;
  outputKwhYear: number;
}

export interface PostPilotComparisonRequest {
  mode: "post_submit_read_only";
  submittedCpid: string;
  fields: readonly PostPilotComparisonField[];
  energySavings: EnergySavingsTrace;
}

export interface PostPilotComparisonRow extends PostPilotComparisonField {
  category: PostPilotDifferenceCategory;
  explanation: string;
}

export interface PostPilotComparisonMatrix {
  mode: "post_submit_read_only";
  submittedCpid: string;
  rows: readonly PostPilotComparisonRow[];
  energySavings: EnergySavingsTrace;
}

function sameValue(left: ComparisonValue["value"], right: ComparisonValue["value"]): boolean {
  return Object.is(left, right);
}

function classify(field: PostPilotComparisonField): Pick<PostPilotComparisonRow, "category" | "explanation"> {
  if (sameValue(field.test.value, field.benchmark.value)) {
    return { category: "coincidente", explanation: "Il risultato test coincide con il benchmark post-invio." };
  }
  if (field.originalSource && !sameValue(field.test.value, field.originalSource.value)) {
    return {
      category: "conflitto_con_fonte_originaria",
      explanation: `Il risultato test non coincide con la fonte originaria ${field.originalSource.sourceId}.`,
    };
  }
  if (field.test.provenance === "operational_assumption") {
    return {
      category: "assunzione_operativa_attesa",
      explanation: `Differenza prevista dalla policy operativa ${field.test.sourceId}; il benchmark non diventa una fonte.`,
    };
  }
  return {
    category: "inconcludente_per_fonte_assente",
    explanation: "Il benchmark non espone la provenienza necessaria per stabilire quale valore sia corretto.",
  };
}

function validateEnergySavingsTrace(trace: EnergySavingsTrace): void {
  if (!trace.policyVersion.trim() || !trace.formula.trim() || trace.coefficient !== 16.8 || !Number.isFinite(trace.outputKwhYear) || trace.outputKwhYear < 0) {
    throw new Error("Audit risparmio energetico locale incompleto");
  }
  if (!trace.rows.length || !Number.isFinite(trace.totalSurfaceM2) || trace.totalSurfaceM2 <= 0) {
    throw new Error("Righe risparmio energetico non riconciliate");
  }
  for (const row of trace.rows) {
    if (!row.rowId.trim() || !row.sourceId.trim() || !Number.isFinite(row.surfaceM2) || row.surfaceM2 <= 0) {
      throw new Error("Provenienza risparmio energetico incompleta");
    }
  }
}

/**
 * Il benchmark storico entra esclusivamente in questa matrice post-invio.
 * Il risultato non espone alcun valore utilizzabile dai mapper ENEA.
 */
export function buildPostPilotComparison(request: PostPilotComparisonRequest): PostPilotComparisonMatrix {
  if (request.mode !== "post_submit_read_only" || !request.submittedCpid.trim()) {
    throw new Error("Benchmark ammesso soltanto dopo invio e CPID verificato");
  }
  validateEnergySavingsTrace(request.energySavings);
  return Object.freeze({
    mode: request.mode,
    submittedCpid: request.submittedCpid,
    rows: Object.freeze(request.fields.map((field) => Object.freeze({ ...field, ...classify(field) }))),
    energySavings: Object.freeze({
      ...request.energySavings,
      rows: Object.freeze(request.energySavings.rows.map((row) => Object.freeze({ ...row }))),
    }),
  });
}
