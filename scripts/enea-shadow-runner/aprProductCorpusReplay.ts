import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { combineDocumentResults, parseScreeningTechnicalSourceText } from "../../src/features/enea-lab/invoiceParser";
import type { EneaLabScreeningItem } from "../../src/features/enea-lab/types";
import {
  observeAprInfissiTechnicalCandidates,
  resolveAprInfissiTechnicalCandidates,
  type AprInfissiTextSource,
} from "../../src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence";
import { resolveInfissiTechnicalSources } from "../../src/features/enea-shadow-crm/infissiTechnicalSources";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { runProductVertical, type AprProductFactsInput, type AprScreeningObservation } from "./aprProductVertical";
import { extractBankTransferEvidences } from "./bankTransferEvidence";
import { resolveFormScreeningMappings } from "./crmLocalPreflight";
import { reconcileLocalInvoiceSegments, splitLocalInvoiceText } from "./localInvoiceSegmentation";

export const APR_PRODUCT_CORPUS_REPLAY_VERSION = "apr-product-corpus-replay-v1" as const;

interface ReplayCase { practiceId: string; customerKey: string }
interface ManifestCase {
  practiceId: string;
  customerKey: string;
  displayName?: string;
  module: "screening" | "infissi";
  evidence: { dossierPath: string; analysisCheckpoint: string; sourceSha256: string[] };
}
interface AnalysisItem {
  documentKey: string;
  customerKey: string;
  kind: string;
  semanticKind?: string | null;
  state: string;
  textPath?: string | null;
  textSha256?: string | null;
  sourceSha256?: string | null;
  extractionMode?: "native_text" | "macos_vision_ocr" | null;
  nonFiscalImageExcluded?: boolean;
  invoiceResult?: { documentType?: string } | null;
  screeningItems?: unknown[];
  documentClassification?: { certificateScope?: string | null } | null;
}
interface AnalysisCheckpoint { items: AnalysisItem[] }

const sha256Text = (value: string) => createHash("sha256").update(value).digest("hex");
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function fiscalSegment(value: string) {
  const bankEvidence = extractBankTransferEvidences("probe", value);
  return bankEvidence.length === 0 || /\b(?:totale\s+(?:documento|fattura|imponibile|iva)|riepilogo\s+iva|calcolo\s+fattura|imponibile\s+(?:iva|aliquota))\b/i.test(value);
}

function sourceTexts(customerKey: string, analysis: AnalysisCheckpoint) {
  return analysis.items.filter((item) => item.customerKey === customerKey && item.state === "analyzed" && item.textPath && existsSync(item.textPath))
    .map((item) => ({ item, value: readFileSync(item.textPath!, "utf8") }));
}

function screeningRows(customerKey: string, analysis: AnalysisCheckpoint) {
  const texts = sourceTexts(customerKey, analysis).filter(({ item }) => item.kind === "invoice" && !item.nonFiscalImageExcluded && item.invoiceResult);
  const seen = new Set<string>();
  const segments = texts.filter(({ item, value }) => {
    const fingerprint = item.textSha256 ?? sha256Text(value);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  }).flatMap(({ item, value }) => splitLocalInvoiceText({
    documentKey: item.documentKey,
    text: value,
    extractionMode: item.extractionMode ?? "macos_vision_ocr",
  })).filter((segment) => ["invoice", "credit_note"].includes(segment.result.documentType) && fiscalSegment(segment.text));
  const reconciled = reconcileLocalInvoiceSegments(segments);
  const combined = reconciled.technicalSegments.length
    ? combineDocumentResults(reconciled.technicalSegments.map((segment) => ({ result: segment.result, items: segment.items })))
    : null;
  const rows = [...(combined?.items ?? [])];
  const signatureCounts = new Map<string, number>();
  for (const item of rows) {
    const signature = [item.description, item.widthMm, item.heightMm, item.gTot].join("|");
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
  }
  const supplemental = sourceTexts(customerKey, analysis)
    .filter(({ item }) => (item.screeningItems?.length ?? 0) === 0 && item.invoiceResult?.documentType !== "invoice" && item.invoiceResult?.documentType !== "credit_note")
    .flatMap(({ item, value }) => parseScreeningTechnicalSourceText(value, item.documentKey))
    .filter((item) => {
      const signature = [item.description, item.widthMm, item.heightMm, item.gTot].join("|");
      const existing = signatureCounts.get(signature) ?? 0;
      if (existing <= 0) return true;
      signatureCounts.set(signature, existing - 1);
      return false;
    });
  return [...rows, ...supplemental];
}

function formRows(dossier: unknown) {
  const row = object(object(dossier)?.row);
  const form = object(row?.dati_form);
  const product = object(form?.prodotto);
  return Array.isArray(product?.schermature) ? product!.schermature.map(object).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function screeningInput(item: ManifestCase, dossier: unknown, analysis: AnalysisCheckpoint): { input: AprProductFactsInput; legacy: unknown } {
  const rows = screeningRows(item.customerKey, analysis);
  const declarations = formRows(dossier);
  const observations: AprScreeningObservation[] = rows.map((row: EneaLabScreeningItem, sequence) => {
    const audit = row.measurementAudit;
    const explicitSurface = row.surfaceAudit?.explicitSurfaceM2
      ?? (Math.abs(row.surfaceM2 - (row.widthMm * row.heightMm) / 1_000_000) > 1e-9 ? row.surfaceM2 : null);
    return {
      observationId: `${row.sourcePath}:physical-${sequence + 1}`,
      sequence,
      sourceId: row.sourcePath,
      description: row.description,
      declaredQuantity: 1,
      originalWidth: audit?.widthOriginal ?? row.widthMm,
      originalHeight: audit?.heightOriginal ?? row.heightMm,
      explicitUnit: audit ? audit.explicitUnit : "mm",
      normalizedWidthMm: row.widthMm,
      normalizedHeightMm: row.heightMm,
      explicitSurfaceM2: explicitSurface,
      observedTransmittanceWm2K: null,
      locator: { sourceId: row.sourcePath, pageNumber: null, contentSha256: null, excerptSha256: null },
      extractionMethod: "pdf_text",
      extractionRuleId: "user-2026-08-14-preserve-technical-product-cardinality",
    };
  });
  const mapping = resolveFormScreeningMappings(declarations, rows.map((row) => row.description));
  const blockers = [
    ...(rows.some((row) => row.surfaceAudit && !row.surfaceAudit.consistent) ? ["screening_dimension_surface_conflict"] : []),
    ...(declarations.length > 0 && mapping.status === "cardinality_mismatch" ? ["product_cardinality_form_invoice_mismatch"] : []),
    ...(rows.length === 0 ? ["screenings_missing"] : []),
  ].sort();
  const physicalRows = rows.map((row) => ({ observationId: "ignored-in-comparison", pieceIndex: 1, widthMm: row.widthMm, heightMm: row.heightMm, surfaceM2: row.surfaceM2, description: row.description, observedTransmittanceWm2K: null }));
  return {
    input: {
      customerKey: item.customerKey,
      practiceId: item.practiceId,
      sourceFingerprint: canonicalSha256(item.evidence.sourceSha256),
      module: "screening",
      screeningObservations: observations,
      screeningFormObservations: declarations.map((value, sequence) => ({
        sequence,
        sourceId: `${item.practiceId}:crm-form`,
        declaredType: text(value.tipo_prodotto) || null,
        locator: { sourceId: `${item.practiceId}:crm-form`, pageNumber: null, contentSha256: null, excerptSha256: null },
      })),
    },
    legacy: { status: blockers.length ? "operator_required" : "ready", blockers, physicalRows },
  };
}

function infissiSources(customerKey: string, practiceCustomerName: string, analysis: AnalysisCheckpoint): AprInfissiTextSource[] {
  return sourceTexts(customerKey, analysis).map(({ item, value }) => {
    const scope = item.documentClassification?.certificateScope;
    return {
      sourceId: item.documentKey,
      kind: item.semanticKind ?? item.kind,
      certificateScope: scope === "installed_windows" || scope === "removed_windows" ? scope : null,
      practiceCustomerName,
      text: value,
    };
  });
}

function infissiInput(item: ManifestCase, analysis: AnalysisCheckpoint): { input: AprProductFactsInput; legacy: unknown } {
  const sources = infissiSources(item.customerKey, item.displayName ?? item.customerKey.replace(/-/gu, " "), analysis);
  const automatic = resolveAprInfissiTechnicalCandidates(observeAprInfissiTechnicalCandidates(sources), { requirePracticeBinding: true });
  const technical = resolveInfissiTechnicalSources({
    practiceId: item.practiceId,
    invoice: automatic.evidence?.kind === "invoice" ? automatic.evidence : undefined,
    technicalDocuments: automatic.evidence?.kind === "technical_document" ? automatic.evidence : undefined,
  });
  const blockers = [...new Set([...automatic.blockers, ...technical.blockers])].sort();
  return {
    input: {
      customerKey: item.customerKey,
      practiceId: item.practiceId,
      sourceFingerprint: canonicalSha256(item.evidence.sourceSha256),
      module: "infissi",
      infissiSources: sources,
    },
    legacy: { status: blockers.length ? "operator_required" : "ready", blockers, physicalRows: technical.rows },
  };
}

function comparisonProjection(result: ReturnType<typeof runProductVertical>) {
  return {
    status: result.status,
    blockers: [...result.blockerCodes],
    physicalRows: result.physicalRows.map((row) => {
      const copy = { ...row };
      delete copy.observationId;
      return copy;
    }),
  };
}

export async function replayProductCorpusFiles(replayPath: string, manifestPath: string) {
  const [replayText, manifestText] = await Promise.all([readFile(replayPath, "utf8"), readFile(manifestPath, "utf8")]);
  const replay = JSON.parse(replayText) as { sourceManifestSha256: string; cases: ReplayCase[] };
  const manifest = JSON.parse(manifestText) as { cases: ManifestCase[] };
  if (sha256Text(manifestText) !== replay.sourceManifestSha256) throw new Error("apr_product_manifest_hash_mismatch");
  const byKey = new Map(manifest.cases.map((item) => [item.customerKey, item]));
  const analysisCache = new Map<string, AnalysisCheckpoint>();
  const rows = replay.cases.map((replayCase) => {
    const item = byKey.get(replayCase.customerKey);
    if (!item || item.practiceId !== replayCase.practiceId) throw new Error(`apr_product_manifest_case_missing:${replayCase.customerKey}`);
    const analysis = analysisCache.get(item.evidence.analysisCheckpoint)
      ?? JSON.parse(readFileSync(item.evidence.analysisCheckpoint, "utf8")) as AnalysisCheckpoint;
    analysisCache.set(item.evidence.analysisCheckpoint, analysis);
    const dossier = JSON.parse(readFileSync(item.evidence.dossierPath, "utf8"));
    const prepared = item.module === "screening" ? screeningInput(item, dossier, analysis) : infissiInput(item, analysis);
    const parallelResult = runProductVertical(prepared.input);
    const legacy = prepared.legacy as { status: string; blockers: string[]; physicalRows: unknown[] };
    const parallel = comparisonProjection(parallelResult);
    const normalizedLegacy = {
      ...legacy,
      physicalRows: legacy.physicalRows.map((row) => {
        const copy = { ...(row as Record<string, unknown>) };
        delete copy.observationId;
        return copy;
      }),
    };
    const identical = canonicalSha256(normalizedLegacy) === canonicalSha256(parallel);
    return {
      customerKey: item.customerKey,
      module: item.module,
      legacy: normalizedLegacy,
      parallel,
      identical,
      factsId: parallelResult.factsArtifact.artifactId,
      decisionsId: parallelResult.decisionsArtifact.artifactId,
    };
  }).sort((left, right) => left.customerKey.localeCompare(right.customerKey));
  const differences = rows.filter((row) => !row.identical).map(({ customerKey, module, legacy, parallel }) => ({ customerKey, module, legacy, parallel }));
  const regressions = differences.filter((item) => item.legacy.status === "ready" && item.parallel.status !== "ready").length;
  return {
    schemaVersion: APR_PRODUCT_CORPUS_REPLAY_VERSION,
    caseCount: rows.length,
    unchanged: rows.length - differences.length,
    improvements: differences.filter((item) => item.legacy.status !== "ready" && item.parallel.status === "ready").length,
    regressions,
    differences,
    firstReplayFingerprint: canonicalSha256(rows.map(({ customerKey, module, legacy, parallel, factsId, decisionsId }) => ({ customerKey, module, legacy, parallel, factsId, decisionsId }))),
    status: regressions === 0 ? "PASS" as const : "FAIL" as const,
  };
}
