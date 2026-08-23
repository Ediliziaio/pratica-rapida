import crypto from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseCompletedEneaText } from "../../src/features/enea-lab/completedEneaAudit";
import { buildPostDraftHistoricalBenchmark, type ComparisonProvenance, type PostPilotComparisonField } from "../../src/features/enea-shadow-crm/postPilotComparison";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { PersistentAprCrmAuth } from "./crmAuth";
import type { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";

const VERSION = "apr-post-draft-historical-benchmark-v1";
const EXCLUDED_FIELDS = Object.freeze([
  "dati impianto termico",
  "risparmio energetico stimato",
  "finestre protette",
  "data fine lavori (TEST)",
]);
const RULE_IDS = Object.freeze([
  USER_AUTHORIZED_RULE_IDS.postDraftHistoricalBenchmarkReadOnly,
  "system-readonly-adapter-contract",
  "system-atomic-checkpoint-resume",
]);

type ExecutionCheckpoint = {
  status: string;
  items: Array<{ customerKey: string; displayName: string; practiceId: string; draftId: string | null; state: string; savedAt?: string | null }>;
};

type DraftPackage = ReturnType<PersistentAprCrmLocalPreflight["buildDraftExecutionPackage"]>;
export type HistoricalComparableField = { id: string; value: string | number | boolean | null; source: string; testOnly?: boolean };

export interface HistoricalBenchmarkDependencies {
  readOnlyGet(pathname: string, searchParams: URLSearchParams, now?: Date): Promise<Response>;
  readOnlyStorageGet(bucket: "enea-documents", objectPath: string, now?: Date): Promise<Response>;
  buildDraftExecutionPackage(customerKey: string, now?: Date): DraftPackage;
  buildComparisonFields?: (customerKey: string, now?: Date) => HistoricalComparableField[];
  extractText?: (blob: Blob) => Promise<string>;
}

export type HistoricalBenchmarkCase = {
  customerKey: string;
  displayName: string;
  practiceId: string;
  draftId: string;
  status: "compared" | "historical_pdf_unavailable" | "historical_pdf_unreadable" | "technical_block";
  historicalPath: string | null;
  historicalPathSha256: string | null;
  cpidPresent: boolean;
  comparedFields: number;
  matchingFields: number;
  differences: Array<{ field: string; draftValue: string | number | boolean | null; crmHistoricalValue: string | number | boolean | null; category: string; source: string }>;
  reason: string;
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function extractPdfTextNode(blob: Blob): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let current: string[] = [];
    let previousY: number | null = null;
    const flush = () => {
      const line = current.join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
      current = [];
    };
    for (const rawItem of content.items) {
      if (!("str" in rawItem) || typeof rawItem.str !== "string") continue;
      const y = Array.isArray(rawItem.transform) && typeof rawItem.transform[5] === "number" ? rawItem.transform[5] : null;
      if (current.length && y !== null && previousY !== null && Math.abs(y - previousY) > 2) flush();
      if (rawItem.str.trim()) current.push(rawItem.str);
      if (rawItem.hasEOL) flush();
      if (y !== null) previousY = y;
    }
    flush();
    pages.push(lines.join("\n"));
  }
  await pdf.destroy();
  return pages.join("\n");
}

function atomicWrite(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, filePath);
}

function isExcludedField(fieldId: string): boolean {
  return fieldId.startsWith("impianto.")
    || fieldId === "schermature.risparmio_energia"
    || /^schermature\.\d+\.superficie_finestrata$/.test(fieldId)
    || fieldId === "intervento.data_fine";
}

function provenance(source: string): ComparisonProvenance {
  return source === "Regola controllata" || source === "Convenzione di prova"
    ? "operational_assumption"
    : source === "Portale ENEA" || source === "Calcolo ENEA"
      ? "portal_derived"
      : "verified_source";
}

function comparisonFields(currentFields: HistoricalComparableField[], historicalFields: Record<string, string>, screeningCount: number): PostPilotComparisonField[] {
  const current = new Map(currentFields.map((field) => [field.id, field]));
  const values = screeningCount >= 0 && historicalFields["schermature.numero"] === undefined
    ? { ...historicalFields, "schermature.numero": String(screeningCount) }
    : historicalFields;
  return Object.entries(values).flatMap(([field, historicalValue]) => {
    if (isExcludedField(field)) return [];
    const draftField = current.get(field);
    if (!draftField || draftField.testOnly) return [];
    return [{
      field,
      test: { value: draftField.value, provenance: provenance(draftField.source), sourceId: `APR:${draftField.source}` },
      benchmark: { value: historicalValue, sourceAvailable: false },
    } satisfies PostPilotComparisonField];
  });
}

function validHistoricalPaths(practiceId: string, value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string"))]
    .filter((item) => item.startsWith(`${practiceId}/`) && /\.pdf$/i.test(item));
}

async function readHistoricPaths(dependencies: HistoricalBenchmarkDependencies, practiceId: string, now: Date): Promise<string[]> {
  const search = new URLSearchParams({ select: "id,pratica_enea_conclusa_urls", id: `eq.${practiceId}`, limit: "1" });
  const response = await dependencies.readOnlyGet("/rest/v1/enea_practices_public", search, now);
  if (!response.ok) throw new Error(`crm_historical_metadata_http_${response.status}`);
  const payload = await response.json() as Array<{ id?: unknown; pratica_enea_conclusa_urls?: unknown }>;
  if (!Array.isArray(payload) || payload.length !== 1 || payload[0].id !== practiceId) throw new Error("crm_historical_identity_mismatch");
  return validHistoricalPaths(practiceId, payload[0].pratica_enea_conclusa_urls);
}

async function compareOne(
  dependencies: HistoricalBenchmarkDependencies,
  item: ExecutionCheckpoint["items"][number],
  now: Date,
): Promise<HistoricalBenchmarkCase> {
  const base = { customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId, draftId: item.draftId! };
  let paths: string[];
  try {
    paths = await readHistoricPaths(dependencies, item.practiceId, now);
  } catch (error) {
    return { ...base, status: "technical_block", historicalPath: null, historicalPathSha256: null, cpidPresent: false, comparedFields: 0, matchingFields: 0, differences: [], reason: error instanceof Error ? error.message : String(error) };
  }
  if (!paths.length) return { ...base, status: "historical_pdf_unavailable", historicalPath: null, historicalPathSha256: null, cpidPresent: false, comparedFields: 0, matchingFields: 0, differences: [], reason: "Nessun PDF ENEA storico associato e consentito dalla pratica CRM." };

  const currentFields = dependencies.buildComparisonFields
    ? dependencies.buildComparisonFields(item.customerKey, now)
    : dependencies.buildDraftExecutionPackage(item.customerKey, now).payload.portalFields;
  let lastFailure = "I PDF storici consentiti non sono leggibili o non contengono campi confrontabili.";
  for (const historicalPath of paths) {
    try {
      const response = await dependencies.readOnlyStorageGet("enea-documents", historicalPath, now);
      if (!response.ok) { lastFailure = `crm_historical_pdf_http_${response.status}`; continue; }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 5 || bytes.byteLength > 20 * 1024 * 1024) { lastFailure = "crm_historical_pdf_size_rejected"; continue; }
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") { lastFailure = "crm_historical_pdf_signature_rejected"; continue; }
      const text = await (dependencies.extractText ?? extractPdfTextNode)(new Blob([bytes], { type: "application/pdf" }));
      const historical = parseCompletedEneaText(text);
      const fields = comparisonFields(currentFields, historical.fields, historical.screeningCount);
      if (!fields.length) { lastFailure = "crm_historical_pdf_no_comparable_fields"; continue; }
      const matrix = buildPostDraftHistoricalBenchmark({
        mode: "post_draft_read_only",
        authorizationRuleId: USER_AUTHORIZED_RULE_IDS.postDraftHistoricalBenchmarkReadOnly,
        draftId: item.draftId!,
        fields,
        excludedFields: EXCLUDED_FIELDS,
      });
      const differences = matrix.rows.filter((row) => row.category !== "coincidente").map((row) => ({
        field: row.field,
        draftValue: row.test.value,
        crmHistoricalValue: row.benchmark.value,
        category: row.category,
        source: row.test.sourceId,
      }));
      return {
        ...base,
        status: "compared",
        historicalPath,
        historicalPathSha256: sha256(historicalPath),
        cpidPresent: Boolean(historical.cpid),
        comparedFields: matrix.rows.length,
        matchingFields: matrix.rows.length - differences.length,
        differences,
        reason: differences.length ? `${differences.length} differenze verificabili rilevate.` : "Nessuna differenza nei campi confrontabili e non esclusi.",
      };
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      // Prosegue sul successivo PDF consentito; nessun retry mutativo e nessuna propagazione al mapper.
    }
  }
  return { ...base, status: "historical_pdf_unreadable", historicalPath: null, historicalPathSha256: null, cpidPresent: false, comparedFields: 0, matchingFields: 0, differences: [], reason: lastFailure };
}

export async function runAprHistoricalBenchmark(
  rootDirectory: string,
  dependencies: HistoricalBenchmarkDependencies,
  now = new Date(),
  customerKeys?: readonly string[],
) {
  const root = path.resolve(rootDirectory);
  const execution = JSON.parse(readFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), "utf8")) as ExecutionCheckpoint;
  if (execution.status !== "completed") throw new Error("apr_historical_benchmark_execution_not_terminal");
  const selectedCustomerKeys = customerKeys?.length ? new Set(customerKeys) : null;
  const saved = execution.items.filter((item) => item.state === "saved"
    && /^\d{4,}$/.test(item.draftId ?? "")
    && (!selectedCustomerKeys || selectedCustomerKeys.has(item.customerKey)));
  const cases: HistoricalBenchmarkCase[] = [];
  for (const item of saved) cases.push(await compareOne(dependencies, item, now));
  const compared = cases.filter((item) => item.status === "compared");
  const report = {
    version: VERSION,
    revision: 1,
    status: cases.every((item) => item.status === "compared") ? "completed" : "completed_with_unavailable_benchmarks",
    executorIdentity: "APR/historical-benchmark-readonly",
    externalMutationAllowed: false,
    historicalValuesMayFeedMapper: false,
    startedAt: now.toISOString(),
    endedAt: new Date().toISOString(),
    scope: { excludedFields: EXCLUDED_FIELDS, authorizationRuleId: USER_AUTHORIZED_RULE_IDS.postDraftHistoricalBenchmarkReadOnly },
    summary: {
      savedDrafts: saved.length,
      compared: compared.length,
      unavailable: cases.length - compared.length,
      comparedFields: compared.reduce((sum, item) => sum + item.comparedFields, 0),
      differences: compared.reduce((sum, item) => sum + item.differences.length, 0),
    },
    cases,
    audit: [{
      revision: 1,
      at: new Date().toISOString(),
      type: "post_draft_historical_benchmark_completed",
      appliedRuleIds: RULE_IDS,
      reason: `${compared.length}/${saved.length} PDF storici confrontati in sola lettura; nessun valore storico propagato al mapper.`,
    }],
  };
  const outputPath = path.join(root, "historical-benchmark", "checkpoint.json");
  atomicWrite(outputPath, report);
  return { outputPath, report };
}
