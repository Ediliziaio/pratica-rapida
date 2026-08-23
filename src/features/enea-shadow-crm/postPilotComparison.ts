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

export interface PostDraftHistoricalBenchmarkRequest {
  mode: "post_draft_read_only";
  authorizationRuleId: "user-2026-08-17-post-draft-historical-enea-benchmark-readonly";
  draftId: string;
  fields: readonly PostPilotComparisonField[];
  excludedFields: readonly string[];
}

export interface PostDraftHistoricalBenchmarkMatrix {
  mode: "post_draft_read_only";
  authorizationRuleId: PostDraftHistoricalBenchmarkRequest["authorizationRuleId"];
  draftId: string;
  rows: readonly PostPilotComparisonRow[];
  excludedFields: readonly string[];
  historicalValuesMayFeedMapper: false;
}

const NUMERIC_FIELD = /^(?:immobile\.superficie|intervento\.unita_oggetto|schermature\.(?:numero|spesa)|schermature\.\d+\.(?:superficie|gtot)|infissi\.(?:numero|spesa)|infissi\.\d+\.(?:superficie|trasmittanza_vecchio|trasmittanza_nuovo))$/;
const DATE_FIELD = /^(?:beneficiario\.data_nascita|intervento\.(?:data_inizio|data_fine))$/;

function normalizedText(value: ComparisonValue["value"]): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it").replace(/[–—]/g, "-");
}

function normalizedDate(value: ComparisonValue["value"]): string {
  const text = normalizedText(value);
  const italian = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return italian ? `${italian[3]}-${italian[2]}-${italian[1]}` : text;
}

function normalizedNumber(value: ComparisonValue["value"]): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = String(value ?? "").replace(/\.(?=\d{3}(?:\D|$))/g, "").match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function equivalentText(fieldId: string, value: ComparisonValue["value"]): string {
  const text = normalizedText(value);
  if (/^(?:beneficiario\.(?:comune_nascita|comune_residenza)|immobile\.comune)$/.test(fieldId)) return text.replace(/\s*\([a-z]{2}\)\s*$/i, "").trim();
  if (fieldId === "beneficiario.titolo") {
    if (text === "proprietario o comproprietario") return "proprietario / comproprietario";
    if (/detentore|co-detentore|affittuario|locatario|comodatario|usufruttuario/.test(text)) return "detentore / affittuario";
  }
  if (fieldId === "immobile.tipologia") {
    if (text === "costruzione isolata (es. mono o plurifamiliare)") return "casa singola o plurifamiliare";
    if (/edificio in linea e condominio oltre i tre piani/.test(text)) return "edificio oltre 3 piani (4+)";
    if (/edificio a schiera e condominio fino a tre piani/.test(text)) return "edificio fino a 3 piani";
  }
  return text;
}

function sameValue(fieldId: string, left: ComparisonValue["value"], right: ComparisonValue["value"]): boolean {
  if (NUMERIC_FIELD.test(fieldId)) {
    const leftNumber = normalizedNumber(left);
    const rightNumber = normalizedNumber(right);
    return leftNumber !== null && rightNumber !== null && Math.abs(leftNumber - rightNumber) < 0.005;
  }
  if (DATE_FIELD.test(fieldId)) return normalizedDate(left) === normalizedDate(right);
  return equivalentText(fieldId, left) === equivalentText(fieldId, right);
}

function classify(field: PostPilotComparisonField): Pick<PostPilotComparisonRow, "category" | "explanation"> {
  if (sameValue(field.field, field.test.value, field.benchmark.value)) {
    return { category: "coincidente", explanation: "Il risultato test coincide con il benchmark post-invio." };
  }
  if (field.originalSource && !sameValue(field.field, field.test.value, field.originalSource.value)) {
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

export function buildPostDraftHistoricalBenchmark(request: PostDraftHistoricalBenchmarkRequest): PostDraftHistoricalBenchmarkMatrix {
  if (request.mode !== "post_draft_read_only"
    || request.authorizationRuleId !== "user-2026-08-17-post-draft-historical-enea-benchmark-readonly"
    || !/^\d{4,}$/.test(request.draftId)
    || !request.fields.length) throw new Error("Benchmark post-bozza non autorizzato o incompleto");
  const required = ["dati impianto termico", "risparmio energetico stimato", "finestre protette", "data fine lavori"];
  const normalized = request.excludedFields.map((value) => value.toLocaleLowerCase("it"));
  if (required.some((field) => !normalized.some((value) => value.includes(field)))) throw new Error("Esclusioni obbligatorie del confronto non complete");
  return Object.freeze({
    mode: request.mode,
    authorizationRuleId: request.authorizationRuleId,
    draftId: request.draftId,
    rows: Object.freeze(request.fields.map((field) => Object.freeze({ ...field, ...classify(field) }))),
    excludedFields: Object.freeze([...request.excludedFields]),
    historicalValuesMayFeedMapper: false,
  });
}
